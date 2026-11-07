import type { ItemScan } from "../packing";
import type { Device, IdleReason, ShiftMark, StaffEvent, WorkstationKind } from "../types";
import { onServer, serverBadges, type BadgeServer } from "./badgeRepository";
import { serverDesks, type DeskServer } from "./deskServer";
import { isStaffEvent } from "./guards";
import { deskOps, type OpQueue } from "./opQueue";
import { readList, storePort, type StorePort } from "./repository";
import { attempt, fail, ok, type Result } from "./result";
import { nowMs } from "../utils";

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
  /** Отменить случайную отметку в первые секунды. */
  undoMark: () => Promise<Result<void>>;
  /**
   * Завести устройство и привязать к нему этот браузер. Пустое имя — отказ
   * `ws.device.nameEmpty`: на экране «Устройства» столы различают по имени.
   */
  addDevice: (name: string, station: WorkstationKind) => Promise<Result<Device>>;
  revokeDevice: (id: string) => Promise<Result<void>>;
  /** Отвязать этот браузер бейджем руководителя. Чужой бейдж — `ws.device.notManager`. */
  unbindDevice: (managerBadge: string) => Promise<Result<void>>;
  /** Начать тару: скан тары с товаром и короба отгрузки. */
  packStart: (sourceCode: string, targetCode: string) => Promise<Result<void>>;
  packItem: (code: string) => Promise<Result<ItemScan>>;
  /** Скан наклеенной этикетки. Не та этикетка — отказ `ws.label.wrong`. */
  packLabel: (code: string) => Promise<Result<void>>;
  packReject: () => Promise<Result<void>>;
  packFinish: () => Promise<Result<void>>;
}

export function createWorkstationRepository(
  port: StorePort = storePort,
  badges: BadgeServer = serverBadges,
  desks: DeskServer = serverDesks,
  ops: OpQueue = deskOps,
): WorkstationRepository {
  /**
   * Отметка смены на сервере уходит операцией (миграция 015): стор уже
   * поставил её, очередь донесёт её с ключом повтора, даже если связь
   * пропала. Запись снимка несёт её тоже — сервер узнает её по id.
   */
  const queueMark = (before: readonly StaffEvent[]) => {
    if (!onServer(port)) return;
    const known = new Set(before.map((e) => e.id));
    const added = port.get().staffEvents.find((e) => !known.has(e.id));
    if (!added) return;
    ops.enqueue("shift_mark", {
      eventId: added.id,
      staffId: added.staffId,
      type: added.type,
      at: added.at,
      ...(added.station ? { station: added.station } : {}),
      ...(added.reason ? { reason: added.reason } : {}),
    });
  };
  const queueUndo = (before: readonly StaffEvent[], at: number) => {
    if (!onServer(port)) return;
    const left = new Set(port.get().staffEvents.map((e) => e.id));
    const gone = before.find((e) => !left.has(e.id));
    if (gone) ops.enqueue("shift_undo", { eventId: gone.id, staffId: gone.staffId, at });
  };
  // На сервере код проверяет сервер (секрет, а не id), и срез получает уже
  // сотрудника; в демо срез разбирает код сам.
  return {
    events: async (staffId) => {
      const all = await readList(() => port.get().staffEvents, isStaffEvent, "staffEvents");
      return all.ok ? ok(all.data.filter((e) => e.staffId === staffId)) : all;
    },
    login: async (code, station) => {
      if (onServer(port)) {
        const who = await badges.check(code);
        if (!who.ok) return who;
        const id = who.data && port.get().openStation(who.data, station);
        return id ? ok(id) : fail("ws.badgeUnknown");
      }
      const res = await attempt(() => port.get().badgeLogin(code, station));
      if (!res.ok) return res;
      return res.data ? ok(res.data) : fail("ws.badgeUnknown");
    },
    logout: async () => {
      // На сервере стол сначала говорит «я ушёл»: иначе его отметки ещё
      // 12 часов принимались бы за этого сотрудника. Сбой связи выход не
      // держит — человек уходит от стола в любом случае.
      if (onServer(port)) await desks.leave();
      return attempt(() => port.get().stationLogout());
    },
    mark: async (type, reason) => {
      const before = port.get().staffEvents;
      const res = await attempt(() => port.get().markShift(type, reason));
      if (!res.ok) return res;
      if (!res.data) return fail("ws.markRejected");
      queueMark(before);
      return ok(undefined);
    },
    undoMark: async () => {
      const before = port.get().staffEvents;
      const at = nowMs();
      const res = await attempt(() => port.get().undoShiftMark());
      if (!res.ok) return res;
      if (!res.data) return fail("ws.markRejected");
      queueUndo(before, at);
      return ok(undefined);
    },
    addDevice: async (name, station) => {
      if (!name.trim()) return fail("ws.device.nameEmpty");
      const made = await attempt(() => port.get().addDevice(name, station));
      if (!made.ok || !onServer(port)) return made;
      // На сервере компьютер становится столом по-настоящему: вход
      // руководителя здесь гаснет, остаётся пропуск стола с узким правом.
      const opened = await desks.open(made.data.id, made.data.name);
      if (opened.ok) return made;
      port.get().revokeDevice(made.data.id);
      return opened;
    },
    revokeDevice: async (id) => {
      if (onServer(port)) {
        const off = await desks.revoke(id);
        if (!off.ok) return off;
      }
      return attempt(() => port.get().revokeDevice(id));
    },
    unbindDevice: async (code) => {
      if (onServer(port)) {
        const desk = await desks.unbind(code);
        if (!desk.ok) return desk;
        if (desk.data === false) return fail("ws.device.notManager");
        if (desk.data === true) {
          // Пропуск стола погашен: этот браузер снова обычный, и дальше
          // в него входят паролем — экран входа, данные на месте.
          const s = port.get();
          if (s.thisDeviceId) s.revokeDevice(s.thisDeviceId);
          s.sessionLost();
          return ok(undefined);
        }
        const who = await badges.check(code);
        if (!who.ok) return who;
        return who.data && port.get().unbindAs(who.data)
          ? ok(undefined)
          : fail("ws.device.notManager");
      }
      const res = await attempt(() => port.get().unbindThisDevice(code));
      if (!res.ok) return res;
      return res.data ? ok(undefined) : fail("ws.device.notManager");
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
