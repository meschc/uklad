import type { Dispute, DisputeResolution } from "../types";
import { isDispute } from "./guards";
import { readList, storePort, type StorePort } from "./repository";
import { attempt, fail, ok, type Result } from "./result";

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
  ) => Promise<Result<void>>;
}

export function createDisputesRepository(port: StorePort = storePort): DisputesRepository {
  return {
    list: () => readList(() => port.get().disputes, isDispute, "disputes"),
    resolve: async (id, resolution, by, note) => {
      const res = await attempt(() => port.get().resolveDispute(id, resolution, by, note));
      if (!res.ok) return res;
      return res.data ? ok(undefined) : fail("disputes.resolveFailed");
    },
  };
}

export const disputesRepository = createDisputesRepository();
