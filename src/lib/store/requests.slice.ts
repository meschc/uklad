import { nowMs, uid } from "../utils";
import { addressKey } from "../address";
import type { FulfillmentRequest, Shipment } from "../types";
import type { RequestsSlice, SliceCreator } from "./state";

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
  recordPick: (id, productId, addr) => {
    const s = get();
    const req = s.requests.find((r) => r.id === id);
    if (!req) return 0;

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
    set((st) => ({
      requests: st.requests.map((r) =>
        r.id === id ? { ...r, pickedQty: picked, updatedAt: nowMs() } : r,
      ),
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
  applyCrossDock: (productId, qty, shipmentId) => {
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
    return used;
  },

  shipRequests: (requestIds, info) => {
    const ids = new Set(requestIds);
    const ready = get().requests.filter((r) => ids.has(r.id) && r.status === "done");
    // Отгружаем только собранное: «в работе» и «новые» физически ещё на полках.
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
    };

    set((s) => ({
      shipments: [shipment, ...s.shipments],
      requests: s.requests.map((r) =>
        ids.has(r.id) && r.status === "done"
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
