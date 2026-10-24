import { nowMs, uid } from "../utils";
import {
  DEFAULT_BREAK_POLICY,
  SESSION_TTL_MS,
  allowedMarks,
  isSessionLive,
  parseBadge,
  shiftState,
} from "../workstation";
import { findByCode, normalizeCode } from "../barcode";
import {
  classifyItemScan,
  isOrderComplete,
  orderLabelCode,
  pendingLabel,
  toteContents,
  toteOrders,
  toteRemaining,
  unitLabelCode,
} from "../packing";
import type { PackSession, StaffEvent } from "../types";
import type { EditorState, SliceCreator, WorkstationSlice } from "./state";

/**
 * Рабочее место по бейджу и журнал сотрудника.
 *
 * Сервера ещё нет, поэтому вход по бейджу — проверка, что такой сотрудник есть
 * в персонале склада, а сессия — запись в сторе. Когда появится backend,
 * бейдж станет одноразовым токеном, а журнал — таблицей; форма записей уже та.
 *
 * Для сервера: секрет бейджа вместо id (см. `badgeCode`), сессию 12 ч выдаёт и
 * проверяет сервер — `expiresAt` из localStorage правдой не считается.
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

export const createWorkstationSlice: SliceCreator<WorkstationSlice> = (set, get) => ({
  staffEvents: [],
  stationSession: null,

  badgeLogin: (code, station) => {
    const staffId = parseBadge(code);
    const member = staffId && (get().warehouse.staff ?? []).find((m) => m.id === staffId);
    if (!member) return null;
    const now = nowMs();
    set({
      stationSession: {
        staffId: member.id,
        station,
        startedAt: now,
        expiresAt: now + SESSION_TTL_MS,
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
          ...(type === "idle_start" ? { reason: reason ?? "other" } : {}),
        }),
      ],
    });
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
    // здесь: собранные заказы двух назначений в один короб, не разделяя их.
    const ready = get().requests.filter((r) => r.status === "done" && !r.packedAt);
    const targets = [...new Set(ready.map((r) => r.note?.trim() || ""))].slice(0, 2);
    const lines = new Map<string, number>();
    for (const r of ready.filter((x) => targets.includes(x.note?.trim() || ""))) {
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
    const target = normalizeCode(targetCode);
    if (!target || target === normalizeCode(box.barcode)) return "ws.tote.targetBad";
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
    const res = classifyItemScan(ps, box, toteOrders(s.requests, box), s.products, code);
    const log = (type: StaffEvent["type"], productId?: string) =>
      event({ staffId: ps.staffId, type, at: now, station: "pack", code, productId });
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
    } else if (res.kind === "not_in_tote" || res.kind === "extra") {
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
  },

  packFinish: () => {
    const s = get();
    const ps = s.packSession;
    const box = ps && s.boxes.find((b) => b.id === ps.sourceBoxId);
    if (!ps || !box) return set({ packSession: null });
    const now = nowMs();
    // Неподтверждённая штука в упаковку не легла — она остаётся в таре.
    const done: PackSession = { ...ps, units: ps.units.filter((u) => u.confirmedAt) };
    const remaining = toteRemaining(done, box);
    const closed = toteOrders(s.requests, box).filter(
      (o) =>
        isOrderComplete(done, o) &&
        (o.units === 1 || done.orderLabels.some((l) => l.orderId === o.id && l.confirmedAt)),
    );
    const packedIds = new Set(closed.flatMap((o) => o.requestIds));
    set({
      boxes: s.boxes.map((b) =>
        b.id === box.id
          ? { ...b, lines: [...remaining].map(([productId, qty]) => ({ productId, qty })) }
          : b,
      ),
      requests: s.requests.map((r) =>
        packedIds.has(r.id) && !r.packedAt
          ? { ...r, packedAt: now, packedBy: ps.staffId, updatedAt: now }
          : r,
      ),
      staffEvents: [
        ...s.staffEvents,
        event({
          staffId: ps.staffId,
          type: "pack_done",
          at: now,
          station: "pack",
          code: box.barcode,
        }),
      ],
      packSession: null,
    });
  },
});
