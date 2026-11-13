import { nowMs, uid } from "../utils";
import {
  adoptInto,
  adoptsGoods,
  needsSecondPair,
  resolutionsFor,
  writeOffProblem,
  writesOffGoods,
} from "../disputes";
import { planCount } from "../inventory";
import type { DisputesSlice, SliceCreator } from "./state";

/**
 * Спорное склада (недостачи, ошибки скана, расхождения инвентаризации). Срез
 * только пишет факты и фиксирует решение старшего; остатки двигает лишь
 * решение старшего: списание недостачи убирает товар из строк тары, а
 * оприходование излишка по инвентаризации добавляет его в ту же тару.
 */
export const createDisputesSlice: SliceCreator<DisputesSlice> = (set, get) => ({
  disputes: [],

  raiseDispute: (input) => {
    const qty = Math.max(1, Math.round(input.qty ?? 1) || 1);
    const same = get().disputes.find(
      (d) =>
        !d.resolution &&
        d.kind === input.kind &&
        d.boxId === input.boxId &&
        d.productId === input.productId,
    );
    if (same) {
      set((s) => ({
        disputes: s.disputes.map((d) => (d.id === same.id ? { ...d, qty: d.qty + qty } : d)),
      }));
      return same.id;
    }
    const id = uid("disp");
    set((s) => ({
      disputes: [
        {
          id,
          kind: input.kind,
          boxId: input.boxId,
          toteCode: input.toteCode,
          productId: input.productId,
          qty,
          raisedBy: input.raisedBy,
          raisedAt: nowMs(),
        },
        ...s.disputes,
      ],
    }));
    return id;
  },

  resolveDispute: (id, resolution, by, note, request) => {
    const d = get().disputes.find((x) => x.id === id);
    if (!d || d.resolution) return false;
    // У лишнего с приёмки свои решения: оставить на складе или списать.
    if (!resolutionsFor(d).includes(resolution)) return false;
    if (request) {
      // Просьба списать: причина обязательна, товар остаётся в таре.
      if (resolution !== "written_off" || !note?.trim()) return false;
      const ask = { by, at: nowMs(), note: note.trim() };
      set((s) => ({
        disputes: s.disputes.map((x) => (x.id === id ? { ...x, writeOffRequest: ask } : x)),
      }));
      return true;
    }
    // Подтверждая просьбу, причину можно не повторять; просивший сам себе
    // не подтверждает.
    const asked = resolution === "written_off" ? d.writeOffRequest : undefined;
    if (asked?.by === by) return false;
    const reason = note?.trim() || asked?.note;
    // Списание — необратимая потеря чужого товара, оприходование излишка —
    // товар из ничего: нужна причина, и решает не тот, кто сам нашёл
    // расхождение (четыре глаза).
    if (needsSecondPair(d, resolution) && (!reason || d.raisedBy === by)) return false;
    // Списать можно только то, что лежит в таре: иначе списание больше
    // остатка — товар, который «ушёл», не уходя (`writeOffProblem`).
    if (resolution === "written_off" && writeOffProblem(get().boxes, d)) return false;
    const now = nowMs();
    set((s) => ({
      disputes: s.disputes.map((x) =>
        x.id === id
          ? { ...x, resolution, resolvedBy: by, resolvedAt: now, note: reason || undefined }
          : x,
      ),
      // Списали недостачу или брак — в таре этого товара больше нет;
      // оприходовали излишек — он лёг в ту же тару.
      boxes:
        resolution === "accepted" && adoptsGoods(d)
          ? adoptInto(s.boxes, d)
          : resolution === "written_off" && writesOffGoods(d) && d.boxId && d.productId
            ? s.boxes.map((b) =>
                b.id === d.boxId
                  ? {
                      ...b,
                      lines: b.lines
                        .map((l) =>
                          l.productId === d.productId ? { ...l, qty: l.qty - d.qty } : l,
                        )
                        .filter((l) => l.qty > 0),
                    }
                  : b,
              )
            : s.boxes,
    }));
    return true;
  },

  countBox: (input) => {
    const s = get();
    const plan = planCount(s.boxes, s.disputes, new Set(s.products.map((p) => p.id)), input);
    if ("problem" in plan) return plan;
    set((x) => ({
      boxes: x.boxes.map((b) => (b.id === plan.box.id ? plan.box : b)),
      disputes: [...plan.disputes, ...x.disputes],
    }));
    return { diffs: plan.diffs };
  },
});
