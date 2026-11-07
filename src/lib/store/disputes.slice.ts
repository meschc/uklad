import { nowMs, uid } from "../utils";
import { writeOffProblem } from "../disputes";
import type { DisputesSlice, SliceCreator } from "./state";

/**
 * Спорное склада (недостачи, ошибки скана). Срез только пишет факты и фиксирует
 * решение старшего; сам он остатков не двигает, кроме одного случая: списание
 * недостачи убирает товар из строк тары, в которой его не оказалось.
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

  resolveDispute: (id, resolution, by, note) => {
    const d = get().disputes.find((x) => x.id === id);
    if (!d || d.resolution) return false;
    // Списание — необратимая потеря чужого товара: нужна причина, и решает не
    // тот, кто сам нашёл недостачу (четыре глаза).
    if (resolution === "written_off" && (!note?.trim() || d.raisedBy === by)) return false;
    // Списать можно только то, что лежит в таре: иначе списание больше
    // остатка — товар, который «ушёл», не уходя (`writeOffProblem`).
    if (resolution === "written_off" && writeOffProblem(get().boxes, d)) return false;
    const now = nowMs();
    set((s) => ({
      disputes: s.disputes.map((x) =>
        x.id === id
          ? { ...x, resolution, resolvedBy: by, resolvedAt: now, note: note?.trim() || undefined }
          : x,
      ),
      // Списали недостачу или брак — в таре этого товара больше нет.
      boxes:
        resolution === "written_off" &&
        (d.kind === "shortage" || d.kind === "not_packable") &&
        d.boxId &&
        d.productId
          ? s.boxes.map((b) =>
              b.id === d.boxId
                ? {
                    ...b,
                    lines: b.lines
                      .map((l) => (l.productId === d.productId ? { ...l, qty: l.qty - d.qty } : l))
                      .filter((l) => l.qty > 0),
                  }
                : b,
            )
          : s.boxes,
    }));
    return true;
  },
});
