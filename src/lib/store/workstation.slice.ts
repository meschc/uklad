import { nowMs, uid } from "../utils";
import {
  DEFAULT_BREAK_POLICY,
  MANAGER_ROLE,
  MARK_UNDO_MS,
  SESSION_TTL_MS,
  allowedMarks,
  isSessionLive,
  parseBadge,
  shiftState,
} from "../workstation";
import { findByCode, normalizeCode } from "../barcode";
import {
  cancelledInTote,
  classifyItemScan,
  isOrderComplete,
  isParcelTote,
  orderLabelCode,
  parcelsOf,
  pendingLabel,
  toteContents,
  toteOrders,
  packedForCancelled,
  toteShortage,
  unitLabelCode,
} from "../packing";
import { addToOutbound, openOutbound, packTargetProblem, type PackedLine } from "../outbound";
import type { Device, PackSession, StaffEvent } from "../types";
import type { EditorState, SliceCreator, WorkstationSlice } from "./state";

/**
 * Рабочее место по бейджу и журнал сотрудника.
 *
 * В демо бейдж — это id сотрудника (`badgeLogin` разбирает код сам). В сборке
 * с сервером код проверяет сервер (секрет бейджа, миграция 010) и называет
 * сотрудника, а срез только открывает вход за него (`openStation`). Сессия
 * и журнал пока живут в снимке кабинета; таблицами они станут вместе с
 * персоналом, и тогда `expiresAt` будет ставить сервер.
 * Журнал и ставка — персональные данные сотрудника: видны ему и руководителю
 * склада, продавцу — нет (экран рабочего места в рельсе продавца отсутствует).
 */

/** Вошедший сотрудник, если вход ещё жив. Истёкший вход — то же, что никакого. */
function liveStaffId(s: EditorState, now: number): string | null {
  return isSessionLive(s.stationSession, now) ? s.stationSession!.staffId : null;
}

function event(e: Omit<StaffEvent, "id">): StaffEvent {
  return { id: uid("sev"), ...e };
}

/** Устройство, к которому привязан этот браузер, если оно есть и не отключено. */
export function boundDevice(s: Pick<EditorState, "devices" | "thisDeviceId">): Device | null {
  const d = s.thisDeviceId ? s.devices.find((x) => x.id === s.thisDeviceId) : undefined;
  return d && !d.revokedAt ? d : null;
}

export const createWorkstationSlice: SliceCreator<WorkstationSlice> = (set, get) => ({
  staffEvents: [],
  stationSession: null,
  devices: [],
  thisDeviceId: null,

  addDevice: (name, station) => {
    const device: Device = { id: uid("dev"), name: name.trim(), station, createdAt: nowMs() };
    // Новое устройство сразу становится этим браузером: заводят его, сидя
    // за тем самым компьютером. Вход, открытый в кабинете, закрываем — дальше
    // за столом входят только по бейджу.
    set((s) => ({
      devices: [...s.devices, device],
      thisDeviceId: device.id,
      stationSession: null,
    }));
    return device;
  },

  revokeDevice: (id) =>
    set((s) => ({
      devices: s.devices.map((d) =>
        d.id === id && !d.revokedAt ? { ...d, revokedAt: nowMs() } : d,
      ),
      // Отключили этот же браузер — вход на нём гаснет вместе с устройством.
      ...(s.thisDeviceId === id ? { thisDeviceId: null, stationSession: null } : {}),
    })),

  unbindThisDevice: (managerBadge) => {
    const staffId = parseBadge(managerBadge);
    return staffId ? get().unbindAs(staffId) : false;
  },

  unbindAs: (staffId) => {
    const member = (get().warehouse.staff ?? []).find((m) => m.id === staffId);
    if (!member || !MANAGER_ROLE.test(member.role)) return false;
    // Отвязанный стол перестаёт быть устройством склада и в списке остаётся
    // отключённым: по нему ещё видно, где и когда он работал.
    const id = get().thisDeviceId;
    set((s) => ({
      devices: s.devices.map((d) =>
        d.id === id && !d.revokedAt ? { ...d, revokedAt: nowMs() } : d,
      ),
      thisDeviceId: null,
      stationSession: null,
    }));
    return true;
  },

  badgeLogin: (code, station) => {
    const staffId = parseBadge(code);
    return staffId ? get().openStation(staffId, station) : null;
  },

  openStation: (staffId, station, permissions) => {
    const member = (get().warehouse.staff ?? []).find((m) => m.id === staffId);
    if (!member) return null;
    const now = nowMs();
    const device = boundDevice(get());
    set({
      stationSession: {
        staffId: member.id,
        // На привязанном устройстве вид места задаёт оно, а не экран.
        station: device?.station ?? station,
        startedAt: now,
        expiresAt: now + SESSION_TTL_MS,
        ...(device ? { deviceId: device.id } : {}),
        ...(permissions !== undefined ? { permissions } : {}),
      },
    });
    return member.id;
  },

  stationLogout: () => set({ stationSession: null }),

  markShift: (type, reason) => {
    const s = get();
    const now = nowMs();
    const staffId = liveStaffId(s, now);
    if (!staffId) return false;
    if (!allowedMarks(shiftState(s.staffEvents, staffId)).includes(type)) return false;
    set({
      staffEvents: [
        ...s.staffEvents,
        event({
          staffId,
          type,
          at: now,
          station: s.stationSession?.station,
          ...(s.stationSession?.deviceId ? { deviceId: s.stationSession.deviceId } : {}),
          ...(type === "idle_start" ? { reason: reason ?? "other" } : {}),
        }),
      ],
    });
    return true;
  },

  undoShiftMark: () => {
    const s = get();
    const now = nowMs();
    const staffId = liveStaffId(s, now);
    if (!staffId) return false;
    const last = [...s.staffEvents]
      .reverse()
      .find((e) => e.staffId === staffId && /^(shift|break|idle)_/.test(e.type));
    if (!last || now - last.at > MARK_UNDO_MS) return false;
    set({ staffEvents: s.staffEvents.filter((e) => e !== last) });
    return true;
  },

  packSession: null,
  breakPolicy: DEFAULT_BREAK_POLICY,

  setBreakPolicy: (patch) =>
    set((s) => {
      const clamp = (v: number | undefined, min: number, max: number, fallback: number) =>
        typeof v === "number" && Number.isFinite(v)
          ? Math.min(max, Math.max(min, Math.round(v)))
          : fallback;
      const p = s.breakPolicy;
      return {
        breakPolicy: {
          everyMin: clamp(patch.everyMin, 15, 480, p.everyMin),
          shortMin: clamp(patch.shortMin, 1, 60, p.shortMin),
          lunchFrom: clamp(patch.lunchFrom, 0, 24 * 60 - 1, p.lunchFrom),
          lunchMin: clamp(patch.lunchMin, 10, 120, p.lunchMin),
          autoIdleMin: clamp(patch.autoIdleMin, 0, 240, p.autoIdleMin ?? 15),
        },
      };
    }),

  prepareDemoTote: () => {
    // Сборка в тару ещё не пишет, что положила, поэтому для демо тару собираем
    // здесь: собранные заказы одного продавца на одно назначение. Короб
    // отгрузки смешивать нельзя (`packTargetProblem`), и демо не должно учить
    // обратному.
    const products = get().products;
    const sellerOf = (id: string) => products.find((p) => p.id === id)?.partnerId ?? "";
    const ready = get().requests.filter((r) => r.status === "done" && !r.packedAt);
    const first = ready[0];
    if (!first) return null;
    const target = first.note?.trim() || "";
    const seller = sellerOf(first.productId);
    const lines = new Map<string, number>();
    for (const r of ready.filter(
      (x) => (x.note?.trim() || "") === target && sellerOf(x.productId) === seller,
    )) {
      const n = r.partial ? (r.pickedQty ?? 0) : r.qty;
      if (n > 0) lines.set(r.productId, (lines.get(r.productId) ?? 0) + n);
    }
    if (lines.size === 0) return null;
    const box = get().createBox();
    set((s) => ({
      boxes: s.boxes.map((b) =>
        b.id === box.id
          ? { ...b, lines: [...lines].map(([productId, qty]) => ({ productId, qty })) }
          : b,
      ),
    }));
    return box.barcode;
  },

  packStart: (sourceCode, targetCode) => {
    const s = get();
    const now = nowMs();
    const staffId = liveStaffId(s, now);
    if (!staffId) return "ws.badgeUnknown";
    const box = findByCode(s.boxes, sourceCode);
    if (!box) return "ws.tote.unknown";
    if (toteContents(box).size === 0) return "ws.tote.empty";
    const orders = toteOrders(s.requests, box);
    // Тара посылок (FBS): короб не выбирают, каждый заказ — своя посылка.
    const target = isParcelTote(orders) ? "" : normalizeCode(targetCode ?? "");
    if (!isParcelTote(orders) && (!target || target === normalizeCode(box.barcode)))
      return "ws.tote.targetBad";
    // Один короб — один продавец и одно назначение: смешанный короб нельзя ни
    // честно выставить в счёт, ни отправить одной машиной.
    const problem = !target
      ? null
      : packTargetProblem({
          open: openOutbound(s.outboundBoxes ?? [], target),
          toteLines: box.lines,
          toteTargets: toteOrders(s.requests, box).map((o) => o.target ?? ""),
          products: s.products,
          requests: s.requests,
        });
    if (problem === "tote_mixed_seller") return "ws.tote.mixedSeller";
    if (problem === "target_other_seller") return "ws.tote.otherSeller";
    if (problem === "target_other_target") return "ws.tote.otherTarget";
    set({
      packSession: {
        id: uid("pack"),
        staffId,
        sourceBoxId: box.id,
        targetCode: target,
        startedAt: now,
        units: [],
        rejects: [],
        orderLabels: [],
        labelSeq: 0,
      },
    });
    return null;
  },

  packScanItem: (code) => {
    const s = get();
    const ps = s.packSession;
    const box = ps && s.boxes.find((b) => b.id === ps.sourceBoxId);
    if (!ps || !box) return { kind: "unknown" };
    const now = nowMs();
    const res = classifyItemScan(
      ps,
      box,
      toteOrders(s.requests, box),
      s.products,
      code,
      cancelledInTote(s.requests, box),
    );
    const log = (type: StaffEvent["type"], productId?: string) =>
      event({
        staffId: ps.staffId,
        type,
        at: now,
        station: "pack",
        code,
        productId,
        ...(s.stationSession?.deviceId ? { deviceId: s.stationSession.deviceId } : {}),
      });
    if (res.kind === "ok") {
      const seq = ps.labelSeq + 1;
      set({
        packSession: {
          ...ps,
          labelSeq: seq,
          units: [
            ...ps.units,
            {
              productId: res.productId,
              orderId: res.orderId,
              labelCode: unitLabelCode(ps.id, seq),
              scannedAt: now,
            },
          ],
        },
        staffEvents: [...s.staffEvents, log("pack_scan", res.productId)],
      });
    } else if (res.kind === "not_in_tote" || res.kind === "extra" || res.kind === "cancelled") {
      // Ошибка скана не мешает работе: товар откладывают, а решает старший.
      // Штука отменённого заказа для старшего — лишнее в таре: вернуть на полку.
      get().raiseDispute({
        kind: res.kind === "cancelled" ? "extra" : res.kind,
        boxId: box.id,
        toteCode: box.barcode,
        productId: res.productId,
        raisedBy: ps.staffId,
      });
      set({
        packSession: {
          ...ps,
          rejects: [...ps.rejects, { productId: res.productId, reason: res.kind, at: now, code }],
        },
        staffEvents: [...s.staffEvents, log("pack_error", res.productId)],
      });
    } else {
      set({ staffEvents: [...s.staffEvents, log("pack_error")] });
    }
    return res;
  },

  packScanLabel: (code) => {
    const s = get();
    const ps = s.packSession;
    const box = ps && s.boxes.find((b) => b.id === ps.sourceBoxId);
    if (!ps || !box) return false;
    const want = pendingLabel(ps);
    if (!want || normalizeCode(code) !== normalizeCode(want)) return false;
    const now = nowMs();
    const unit = ps.units.find((u) => !u.confirmedAt);
    let next: PackSession;
    let ev: StaffEvent;
    if (unit) {
      next = {
        ...ps,
        units: ps.units.map((u) => (u === unit ? { ...u, confirmedAt: now } : u)),
      };
      ev = event({
        staffId: ps.staffId,
        type: "pack_label",
        at: now,
        station: "pack",
        code: unit.labelCode,
        productId: unit.productId,
        orderId: unit.orderId,
        ms: now - unit.scannedAt,
      });
      // Заказ из нескольких штук закрывается своей этикеткой: она печатается,
      // как только в упаковку легла его последняя штука.
      const order = unit.orderId && toteOrders(s.requests, box).find((o) => o.id === unit.orderId);
      if (order && order.units > 1 && isOrderComplete(next, order)) {
        next = {
          ...next,
          orderLabels: [
            ...next.orderLabels,
            { orderId: order.id, labelCode: orderLabelCode(order.id) },
          ],
        };
      }
    } else {
      next = {
        ...ps,
        orderLabels: ps.orderLabels.map((l) =>
          l.labelCode === want ? { ...l, confirmedAt: now } : l,
        ),
      };
      const label = ps.orderLabels.find((l) => l.labelCode === want)!;
      ev = event({
        staffId: ps.staffId,
        type: "pack_label",
        at: now,
        station: "pack",
        code: want,
        orderId: label.orderId,
      });
    }
    set({ packSession: next, staffEvents: [...s.staffEvents, ev] });
    return true;
  },

  packRejectPending: () => {
    const s = get();
    const ps = s.packSession;
    const unit = ps?.units.find((u) => !u.confirmedAt);
    if (!ps || !unit) return;
    const box = s.boxes.find((b) => b.id === ps.sourceBoxId);
    const now = nowMs();
    set({
      packSession: {
        ...ps,
        units: ps.units.filter((u) => u !== unit),
        rejects: [
          ...ps.rejects,
          { productId: unit.productId, reason: "defect", at: now, code: unit.labelCode },
        ],
      },
      staffEvents: [
        ...s.staffEvents,
        event({
          staffId: ps.staffId,
          type: "pack_reject",
          at: now,
          station: "pack",
          productId: unit.productId,
        }),
      ],
    });
    // Брак остаётся в таре на учёте и уходит старшему: списывает не
    // упаковщик, иначе брак — способ тихо вынести товар.
    if (box) {
      get().raiseDispute({
        kind: "not_packable",
        boxId: box.id,
        toteCode: box.barcode,
        productId: unit.productId,
        raisedBy: ps.staffId,
      });
    }
  },

  packFinish: () => {
    const s = get();
    const ps = s.packSession;
    const box = ps && s.boxes.find((b) => b.id === ps.sourceBoxId);
    if (!ps || !box) {
      set({ packSession: null });
      return null;
    }
    const now = nowMs();
    // Неподтверждённая штука в упаковку не легла — она остаётся в таре.
    const done: PackSession = { ...ps, units: ps.units.filter((u) => u.confirmedAt) };
    const cancelled = cancelledInTote(s.requests, box);
    const remaining = toteShortage(done, box, cancelled);
    // Заказ отменили, пока тара была на столе: его штуки вынимают из короба,
    // они остаются в таре вместе с остальным отменённым.
    const pulled = new Set(packedForCancelled(done, cancelled));
    const orders = toteOrders(s.requests, box);
    const closed = orders.filter(
      (o) =>
        isOrderComplete(done, o) &&
        (o.units === 1 || done.orderLabels.some((l) => l.orderId === o.id && l.confirmedAt)),
    );
    // Недостачу сотрудник не оформляет: тара с остатком уходит старшему, а в
    // системе остаётся запись — что не нашли, в какой таре и кто закрывал.
    const shortages: string[] = [];
    for (const [productId, qty] of remaining) {
      if (qty > 0)
        shortages.push(
          get().raiseDispute({
            kind: "shortage",
            boxId: box.id,
            toteCode: box.barcode,
            productId,
            qty,
            raisedBy: ps.staffId,
          }),
        );
    }
    // Что уходит из тары: тара посылок (FBS) — каждый закрытый заказ своей
    // посылкой; тара поставки — всё подтверждённое в один короб поставки. По
    // этому составу сортировка и погрузка потом сверяют машину. Больше, чем
    // сейчас лежит в таре, взять нельзя: пока тара была на столе, старший мог
    // списать из неё брак.
    const content = toteContents(box);
    const parcels: { code: string; requestIds: string[]; lines: PackedLine[] }[] = ps.targetCode
      ? [
          {
            code: ps.targetCode,
            requestIds: closed.flatMap((o) => o.requestIds),
            lines: countLines(done.units.filter((u) => !pulled.has(u))),
          },
        ]
      : parcelsOf(done, closed);
    const left = new Map(content);
    for (const p of parcels) {
      p.lines = p.lines
        .map((l) => {
          const qty = Math.min(l.qty, left.get(l.productId) ?? 0);
          left.set(l.productId, (left.get(l.productId) ?? 0) - qty);
          return { productId: l.productId, qty };
        })
        .filter((l) => l.qty > 0);
    }
    const packedIds = new Set(parcels.flatMap((p) => p.requestIds));
    // В таре остаётся всё, что не ушло: недостача и брак — на учёте, пока их
    // не решит старший. Считаем от того, что в таре сейчас, а не от начала
    // упаковки, иначе списанное за это время вернулось бы.
    const kept = left;
    const doneEvents = (parcels.length ? parcels : [null]).map((p) =>
      event({
        staffId: ps.staffId,
        type: "pack_done",
        at: now,
        station: "pack",
        code: p?.code ?? box.barcode,
      }),
    );
    let outboundBoxes = get().outboundBoxes ?? [];
    for (const p of parcels)
      outboundBoxes = addToOutbound(outboundBoxes, {
        code: p.code,
        lines: p.lines,
        requestIds: p.requestIds,
        staffId: ps.staffId,
        at: now,
        newId: () => uid("out"),
      });
    set({
      outboundBoxes,
      boxes: get().boxes.map((b) =>
        b.id === box.id
          ? {
              ...b,
              lines: [...kept]
                .filter(([, qty]) => qty > 0)
                .map(([productId, qty]) => ({ productId, qty })),
            }
          : b,
      ),
      requests: s.requests.map((r) =>
        packedIds.has(r.id) && !r.packedAt
          ? { ...r, packedAt: now, packedBy: ps.staffId, updatedAt: now }
          : r,
      ),
      staffEvents: [...get().staffEvents, ...doneEvents],
      packSession: null,
    });
    const disputes = get().disputes;
    const shortageFacts = shortages.flatMap((id) => {
      const d = disputes.find((x) => x.id === id);
      return d?.productId ? [{ id, productId: d.productId, qty: d.qty }] : [];
    });
    // Одна операция на посылку: сервер повторяет их по очереди, недостача —
    // в последней, когда в таре уже осталось только неупакованное.
    return doneEvents.map((ev, i) => {
      const p = parcels[i];
      const last = i === doneEvents.length - 1;
      return {
        eventId: ev.id,
        staffId: ps.staffId,
        at: now,
        toteId: box.id,
        outboundCode: p?.code ?? "",
        outboundId: p ? (openOutbound(outboundBoxes, p.code)?.id ?? null) : null,
        lines: p?.lines ?? [],
        requestIds: p?.requestIds ?? [],
        shortages: last ? shortageFacts : [],
      };
    });
  },
});

/** Штуки → строки состава. */
function countLines(units: readonly { productId: string }[]): PackedLine[] {
  const m = new Map<string, number>();
  for (const u of units) m.set(u.productId, (m.get(u.productId) ?? 0) + 1);
  return [...m].map(([productId, qty]) => ({ productId, qty }));
}
