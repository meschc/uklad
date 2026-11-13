import { needsSecondPair, writeOffProblem } from "../disputes";
import type { Dispute, DisputeResolution } from "../types";
import { isDispute } from "./guards";
import { onServer } from "./badgeRepository";
import { deskOps, type OpQueue } from "./opQueue";
import { readList, storePort, type StorePort } from "./repository";
import { attempt, fail, ok, type Result } from "./result";
import { nowMs, uid } from "../utils";

/**
 * Спорное склада (п.0.4). Решение старшего — команда к слою данных: на сервере
 * это будет запись с проверкой права `disputes.resolve`, а сегодня проверка
 * только на экране.
 */
export interface DisputesRepository {
  list: () => Promise<Result<Dispute[]>>;
  resolve: (
    id: string,
    resolution: DisputeResolution,
    by: string,
    note?: string,
    /** Только попросить списать — подтвердит начальник. */
    request?: boolean,
  ) => Promise<Result<void>>;
}

export function createDisputesRepository(
  port: StorePort = storePort,
  ops: OpQueue = deskOps,
): DisputesRepository {
  return {
    list: () => readList(() => port.get().disputes, isDispute, "disputes"),
    resolve: async (id, resolution, by, note, request) => {
      const found = port.get().disputes.find((x) => x.id === id);
      const asked = resolution === "written_off" ? found?.writeOffRequest : undefined;
      if (found && needsSecondPair(found, resolution)) {
        if (!note?.trim() && !asked) return fail("disputes.noteRequired");
        if (found.raisedBy === by || asked?.by === by) return fail("disputes.selfWriteOff");
      }
      if (found && resolution === "written_off" && writeOffProblem(port.get().boxes, found)) {
        return fail("disputes.notInTote");
      }
      const res = await attempt(() => port.get().resolveDispute(id, resolution, by, note, request));
      if (!res.ok) return res;
      if (!res.data) return fail("disputes.resolveFailed");
      // Старший за столом на сервере решает операцией (`cabinet/deskShip.js`):
      // сервер сам проверит, что он старший и что списание не своё. Просьбу
      // и подтверждение сервер различает сам — по праву `goods.writeoff`.
      const at = port.get().stationSession?.staffId;
      if (at && at === by && onServer(port)) {
        ops.enqueue("dispute_resolve", {
          eventId: uid("dr"),
          staffId: by,
          at: nowMs(),
          disputeId: id,
          resolution,
          ...(note?.trim() ? { note: note.trim() } : {}),
        });
      }
      return ok(undefined);
    },
  };
}

export const disputesRepository = createDisputesRepository();
