import { nowMs, uid } from "../utils";
import { addressKey } from "../address";
import { planLoad, shipOutbound } from "../outbound";
import { isOrderSource, type Box, type FulfillmentRequest, type Shipment } from "../types";
import type { RequestsSlice, SliceCreator } from "./state";

const MAX_EXTERNAL_ID = 64;

function orderOrigin(
  source: unknown,
  externalId: string | undefined,
): Pick<FulfillmentRequest, "source" | "externalId"> {
  if (!isOrderSource(source) || source === "manual") return {};
  return { source, externalId: externalId?.trim().slice(0, MAX_EXTERNAL_ID) || undefined };
}

/**
 * Заявки продавца на отгрузку и переключатель роли.
 *
 * Роль — это режим просмотра одних и тех же локальных данных, а не второй
 * аккаунт: backend в прототипе нет (см. CLAUDE.md). Сама сущность заявки
 * спроектирована плоской, чтобы позже лечь в таблицу Supabase без правок.
 */
export const createRequestsSlice: SliceCreator<RequestsSlice> = (set, get) => ({
  requests: [],
  shipments: [],
  outboundBoxes: [],

  createRequest: (input) => {
    const now = nowMs();
    const req: FulfillmentRequest = {
      ...input,
      id: uid("req"),
      qty: Math.max(1, Math.round(input.qty)),
      status: "new",
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({ requests: [req, ...s.requests] }));
    return req.id;
  },

  createRequests: (items, truckDate) => {
    const now = nowMs();
    const created = items
      .filter((it) => it.productId && it.qty > 0)
      .map<FulfillmentRequest>((it) => ({
        id: uid("req"),
        productId: it.productId,
        qty: Math.max(1, Math.round(it.qty)),
        note: it.note?.trim() || undefined,
        vehicle: it.vehicle?.trim() || undefined,
        // «Своя» заявка источника не хранит: пусто и значит «вручную». Номер
        // заказа живёт только вместе с принятой площадкой и не длиннее 64
        // знаков: он уходит в снимок компании и в localStorage.
        ...orderOrigin(it.source, it.externalId),
        truckDate,
        status: "new",
        createdAt: now,
        updatedAt: now,
      }));
    if (!created.length) return [];
    set((s) => ({ requests: [...created, ...s.requests] }));
    return created.map((r) => r.id);
  },

  updateRequestStatus: (id, status) => {
    set((s) => ({
      requests: s.requests.map((r) => {
        if (r.id !== id) return r;
        return {
          ...r,
          status,
          updatedAt: nowMs(),
          // Момент взятия в работу фиксируем один раз — на нём стоит метрика
          // «среднее время сборки» в дашборде.
          startedAt: status === "in_progress" ? (r.startedAt ?? nowMs()) : r.startedAt,
        };
      }),
    }));
    // Отменённая заявка ничего не ждёт — освобождаем забронированное под неё
    // количество, иначе поставка выглядела бы распроданной впустую.
    if (status === "cancelled") get().releaseReservation(id);
  },

  /**
   * Заявка переходит в «в работе» в момент, когда сборщик открывает её на
   * экране «Сборка». Решение осознанное: до этого момента никто физически
   * ничего не делает, а список «Задания» показывает честную картину.
   */
  startPicking: (id) => {
    const req = get().requests.find((r) => r.id === id);
    if (!req || req.status === "done" || req.status === "cancelled") return;
    if (req.status === "in_progress") return;
    get().updateRequestStatus(id, "in_progress");
  },

  /**
   * Одна собранная единица: списываем её с места (из коробки или с прямого
   * размещения) и увеличиваем счётчик заявки. Списание обязательно — иначе
   * занятость росла бы при приёмке и никогда не падала при отгрузке (см. 2.1).
   */
  recordPick: (id, productId, addr, toteId, by) => {
    const s = get();
    const req = s.requests.find((r) => r.id === id);
    if (!req) return 0;
    // Заявка уже собрана: лишний скан не снимает с полки ещё одну штуку —
    // иначе она ушла бы с места и не пришла никуда.
    if ((req.pickedQty ?? 0) >= req.qty) return req.pickedQty ?? 0;
    // Начатая заявка собирается в ту же тару: штука в другой таре (или в
    // руках, без тары) потерялась бы для упаковки и для остатков — заявка
    // помнит одну тару (`toteId`).
    if ((req.pickedQty ?? 0) > 0 && req.toteId !== toteId) return req.pickedQty ?? 0;

    const key = addressKey(addr);
    const box = s.boxes.find(
      (b) =>
        b.address &&
        addressKey(b.address) === key &&
        b.lines.some((l) => l.productId === productId && l.qty > 0),
    );
    let taken = 0;
    if (box) {
      taken = s.removeFromBox(box.id, productId, 1);
    } else if (s.placements[productId] && addressKey(s.placements[productId]) === key) {
      s.clearPlacement(productId);
      taken = 1;
    }
    if (!taken) return req.pickedQty ?? 0;

    const picked = Math.min(req.qty, (req.pickedQty ?? 0) + taken);
    const at = nowMs();
    const tote = toteId ? s.boxes.find((b) => b.id === toteId) : undefined;
    set((st) => ({
      // Кто снял, что и в какую тару — в журнал сотрудника, до секунды.
      ...(by
        ? {
            staffEvents: [
              ...st.staffEvents,
              {
                id: uid("sev"),
                staffId: by,
                type: "pick_scan" as const,
                at,
                station: "picking" as const,
                productId,
                ...(tote ? { code: tote.barcode } : {}),
              },
            ],
          }
        : {}),
      requests: st.requests.map((r) =>
        r.id === id
          ? { ...r, pickedQty: picked, updatedAt: nowMs(), ...(toteId ? { toteId } : {}) }
          : r,
      ),
      // Снятое с полки не исчезает, а едет к столу упаковки в таре сборки:
      // иначе упаковщику нечего сканировать, а остатки не сходятся.
      boxes: toteId
        ? st.boxes.map((b) => (b.id === toteId ? addLine(b, productId, taken) : b))
        : st.boxes,
    }));
    return picked;
  },

  completeRequest: (id, partial = false) => {
    set((s) => ({
      requests: s.requests.map((r) =>
        r.id === id ? { ...r, status: "done", partial, updatedAt: nowMs() } : r,
      ),
    }));
    // Собранная заявка больше ничего не ждёт: бронь под поставку снимается,
    // иначе она вечно висела бы на строке и съедала свободное количество.
    get().releaseReservation(id);
  },

  /**
   * Дропшиппинг (п.10.1): продать то, чего ещё нет. Ищем строку ожидаемой
   * поставки с этим товаром и свободным количеством — «свободное» считается
   * как ожидаемое минус уже забронированное другими заявками, иначе одну
   * коробку можно продать дважды.
   */
  reserveRequest: (id) => {
    const s = get();
    const req = s.requests.find((r) => r.id === id);
    if (!req || req.reservedShipmentId) return req?.reservedShipmentId ?? null;

    const qtyOf = (rid: string) => s.requests.find((r) => r.id === rid)?.qty ?? 0;

    for (const sh of s.expectedShipments) {
      if (sh.status === "closed") continue;
      const line = sh.lines.find((l) => {
        if (l.productId !== req.productId) return false;
        const booked = (l.reservedFor ?? []).reduce((sum, rid) => sum + qtyOf(rid), 0);
        return l.expectedQty - l.receivedQty - booked >= req.qty;
      });
      if (!line) continue;

      set((st) => ({
        expectedShipments: st.expectedShipments.map((x) =>
          x.id !== sh.id
            ? x
            : {
                ...x,
                lines: x.lines.map((l) =>
                  l.id === line.id ? { ...l, reservedFor: [...(l.reservedFor ?? []), id] } : l,
                ),
              },
        ),
        requests: st.requests.map((r) =>
          r.id === id ? { ...r, reservedShipmentId: sh.id, updatedAt: nowMs() } : r,
        ),
      }));
      return sh.id;
    }
    return null;
  },

  releaseReservation: (id) =>
    set((s) => {
      const req = s.requests.find((r) => r.id === id);
      if (!req?.reservedShipmentId) return {};
      return {
        expectedShipments: s.expectedShipments.map((sh) =>
          sh.id !== req.reservedShipmentId
            ? sh
            : {
                ...sh,
                lines: sh.lines.map((l) =>
                  l.reservedFor?.includes(id)
                    ? {
                        ...l,
                        reservedFor: l.reservedFor.filter((x) => x !== id),
                      }
                    : l,
                ),
              },
        ),
        requests: s.requests.map((r) =>
          r.id === id ? { ...r, reservedShipmentId: undefined } : r,
        ),
      };
    }),

  /**
   * Кроссдокинг (п.10.1): принятый товар не едет на полку, а закрывает заявки
   * прямо с рампы. Сначала — те, кто эту поставку и ждал (бронь), потом
   * остальные открытые заявки на тот же товар: физически коробка уже здесь,
   * и держать её ради формального порядка бессмысленно.
   */
  applyCrossDock: (productId, qty, shipmentId, boxId) => {
    let left = Math.max(0, Math.round(qty));
    if (!left) return 0;

    const open = get()
      .requests.filter(
        (r) => r.productId === productId && (r.status === "new" || r.status === "in_progress"),
      )
      .sort((a, b) => {
        const mine = (r: typeof a) => (shipmentId && r.reservedShipmentId === shipmentId ? 0 : 1);
        return mine(a) - mine(b) || a.createdAt - b.createdAt;
      });

    let used = 0;
    for (const r of open) {
      if (!left) break;
      const need = r.qty - (r.pickedQty ?? 0);
      if (need <= 0) continue;
      const take = Math.min(need, left);
      left -= take;
      used += take;
      const picked = (r.pickedQty ?? 0) + take;
      set((st) => ({
        requests: st.requests.map((x) =>
          x.id === r.id
            ? {
                ...x,
                pickedQty: picked,
                status: picked >= x.qty ? "done" : "in_progress",
                startedAt: x.startedAt ?? nowMs(),
                updatedAt: nowMs(),
              }
            : x,
        ),
      }));
      if (picked >= r.qty) get().releaseReservation(r.id);
    }
    // Ушедшее в заявки уже не лежит в таре приёмки: оно едет с заявкой, как
    // снятое с полки. Иначе одна штука числилась бы и в таре, и в заявке.
    if (boxId && used > 0) get().removeFromBox(boxId, productId, used);
    return used;
  },

  shipRequests: (requestIds, info) => {
    const ids = new Set(requestIds);
    const done = get().requests.filter((r) => ids.has(r.id) && r.status === "done");
    // Отгружаем только собранное: «в работе» и «новые» физически ещё на полках.
    // Заявка, чей короб отгрузки остался у стола, ждёт следующей машины.
    const plan = planLoad(
      get().outboundBoxes ?? [],
      done.map((r) => r.id),
      info?.units ?? [],
    );
    if (plan.split) return null;
    const leaving = new Set(plan.going);
    const ready = done.filter((r) => leaving.has(r.id));
    if (!ready.length) return null;

    const shipmentId = uid("ship");
    const at = nowMs();
    const destination = ready[0].note?.trim() || "";
    const shipment: Shipment = {
      id: shipmentId,
      destination,
      requestIds: ready.map((r) => r.id),
      vehicle: info?.vehicle?.trim() || undefined,
      staffId: info?.staffId,
      shippedAt: at,
      units: info?.units?.length ? [...info.units] : undefined,
    };

    set((s) => ({
      shipments: [shipment, ...s.shipments],
      // Погруженные короба уехали этим рейсом: их код свободен для нового.
      outboundBoxes: shipOutbound(s.outboundBoxes ?? [], shipment.units ?? [], shipmentId, at),
      requests: s.requests.map((r) =>
        leaving.has(r.id)
          ? {
              ...r,
              status: "shipped",
              shipmentId,
              shippedAt: at,
              updatedAt: at,
            }
          : r,
      ),
    }));
    get().showToast("toast.shipped", { n: ready.length });
    return shipmentId;
  },
});

/** Положить штуки товара в тару. */
function addLine(box: Box, productId: string, qty: number): Box {
  const has = box.lines.some((l) => l.productId === productId);
  return {
    ...box,
    lines: has
      ? box.lines.map((l) => (l.productId === productId ? { ...l, qty: l.qty + qty } : l))
      : [...box.lines, { productId, qty }],
  };
}
