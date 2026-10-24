import type { ItemScan } from "../packing";
import type { IdleReason, ShiftMark, StaffEvent, WorkstationKind } from "../types";
import { isStaffEvent } from "./guards";
import { readList, storePort, type StorePort } from "./repository";
import { attempt, fail, ok, type Result } from "./result";

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
  mark: (type: ShiftMark, reason?: IdleReason) => Promise<Result<void>>;
  /** Начать тару: скан тары с товаром и короба отгрузки. */
  packStart: (sourceCode: string, targetCode: string) => Promise<Result<void>>;
  packItem: (code: string) => Promise<Result<ItemScan>>;
  /** Скан наклеенной этикетки. Не та этикетка — отказ `ws.label.wrong`. */
  packLabel: (code: string) => Promise<Result<void>>;
  packReject: () => Promise<Result<void>>;
  packFinish: () => Promise<Result<void>>;
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
    mark: async (type, reason) => {
      const res = await attempt(() => port.get().markShift(type, reason));
      if (!res.ok) return res;
      return res.data ? ok(undefined) : fail("ws.markRejected");
    },
    packStart: async (source, target) => {
      const res = await attempt(() => port.get().packStart(source, target));
      if (!res.ok) return res;
      return res.data ? fail(res.data) : ok(undefined);
    },
    packItem: (code) => attempt(() => port.get().packScanItem(code)),
    packLabel: async (code) => {
      const res = await attempt(() => port.get().packScanLabel(code));
      if (!res.ok) return res;
      return res.data ? ok(undefined) : fail("ws.label.wrong");
    },
    packReject: () => attempt(() => port.get().packRejectPending()),
    packFinish: () => attempt(() => port.get().packFinish()),
  };
}

export const workstationRepository = createWorkstationRepository();
