import type { StaffEvent, StaffEventType, WorkstationKind } from "../types";
import { isStaffEvent } from "./guards";
import { readList, storePort, type StorePort } from "./repository";
import { attempt, fail, ok, type Result } from "./result";

type ShiftMark = Extract<StaffEventType, "shift_start" | "break_start" | "break_end" | "shift_end">;

/**
 * Рабочее место и журнал сотрудника (п.0.4). Здесь появится сеть: вход по
 * бейджу станет обменом кода на токен смены, отметки и упаковки — запросами.
 * Экран уже ходит сюда, а не в стор, поэтому меняться при этом не будет.
 */
export interface WorkstationRepository {
  /** Журнал сотрудника, новые записи последними. */
  events: (staffId: string) => Promise<Result<StaffEvent[]>>;
  /** Вход по скану бейджа. Чужой или битый бейдж — отказ `ws.badgeUnknown`. */
  login: (code: string, station: WorkstationKind) => Promise<Result<string>>;
  logout: () => Promise<Result<void>>;
  mark: (type: ShiftMark) => Promise<Result<void>>;
  logScan: (orderId: string, code: string, ok: boolean) => Promise<Result<void>>;
  pack: (orderId: string, requestIds: string[]) => Promise<Result<void>>;
}

export function createWorkstationRepository(port: StorePort = storePort): WorkstationRepository {
  return {
    events: async (staffId) => {
      const all = await readList(() => port.get().staffEvents, isStaffEvent, "staffEvents");
      return all.ok ? ok(all.data.filter((e) => e.staffId === staffId)) : all;
    },
    login: async (code, station) => {
      const res = await attempt(() => port.get().badgeLogin(code, station));
      if (!res.ok) return res;
      return res.data ? ok(res.data) : fail("ws.badgeUnknown");
    },
    logout: () => attempt(() => port.get().stationLogout()),
    mark: async (type) => {
      const res = await attempt(() => port.get().markShift(type));
      if (!res.ok) return res;
      return res.data ? ok(undefined) : fail("ws.markRejected");
    },
    logScan: (orderId, code, isOk) => attempt(() => port.get().logPackScan(orderId, code, isOk)),
    pack: (orderId, requestIds) => attempt(() => port.get().packOrder(orderId, requestIds)),
  };
}

export const workstationRepository = createWorkstationRepository();
