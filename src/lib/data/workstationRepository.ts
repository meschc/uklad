import type { ItemScan } from "../packing";
import type {
  CellAddress,
  Device,
  IdleReason,
  ShiftMark,
  StaffEvent,
  WorkstationKind,
} from "../types";
import { onServer, serverBadges, type BadgeServer } from "./badgeRepository";
import { serverDesks, type DeskServer, type DeviceJournalEntry } from "./deskServer";
import { isStaffEvent } from "./guards";
import { deskOps, type OpQueue } from "./opQueue";
import { readList, storePort, type StorePort } from "./repository";
import { attempt, fail, ok, type Result } from "./result";
import { nowMs, uid } from "../utils";

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
  /** Журнал устройства: кто и что делал за ним, новые сверху. */
  deviceJournal: (id: string) => Promise<Result<DeviceJournalEntry[]>>;
  /** Отвязать этот браузер бейджем руководителя. Чужой бейдж — `ws.device.notManager`. */
  unbindDevice: (managerBadge: string) => Promise<Result<void>>;
  /** Начать тару: скан тары с товаром и короба отгрузки. */
  packStart: (sourceCode: string, targetCode: string) => Promise<Result<void>>;
  packItem: (code: string) => Promise<Result<ItemScan>>;
  /** Скан наклеенной этикетки. Не та этикетка — отказ `ws.label.wrong`. */
  packLabel: (code: string) => Promise<Result<void>>;
  packReject: () => Promise<Result<void>>;
  packFinish: () => Promise<Result<void>>;
  /**
   * Снять штуку с места в тару под заявку. Ответ — сколько собрано теперь;
   * не изменилось — снять было нечего (пустое место, чужая тара, заявка уже
   * собрана).
   */
  pickUnit: (
    requestId: string,
    productId: string,
    addr: CellAddress,
    toteId?: string,
  ) => Promise<Result<number>>;
  /** Заявка собрана: целиком или частично (меньше запрошенного, явно). */
  pickDone: (requestId: string, partial: boolean) => Promise<Result<void>>;
  /**
   * Машина уехала: собранные заявки одного назначения и погруженные места.
   * Ответ — id рейса, null — отгружать нечего.
   */
  ship: (
    requestIds: string[],
    info: { vehicle: string; staffId: string; units: string[] },
  ) => Promise<Result<string | null>>;
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
  /**
   * Упаковка на сервере уходит операциями (`cabinet/deskPack.js`): скан,
   * этикетка и брак — записью журнала (со спорным, если скан его завёл),
   * закрытие тары — фактами, по которым сервер сам повторит правку.
   */
  const queuePack = <T>(act: () => T): T => {
    const s = port.get();
    const toteId = s.packSession?.sourceBoxId;
    const events = new Set(s.staffEvents.map((e) => e.id));
    const disputes = new Map(s.disputes.map((d) => [d.id, d.qty]));
    const out = act();
    if (!onServer(port) || !toteId) return out;
    const after = port.get();
    const raised = after.disputes.find(
      (d) => d.boxId === toteId && !d.resolution && disputes.get(d.id) !== d.qty,
    );
    for (const e of after.staffEvents) {
      if (events.has(e.id) || !e.type.startsWith("pack_")) continue;
      ops.enqueue("pack_event", {
        eventId: e.id,
        staffId: e.staffId,
        type: e.type,
        at: e.at,
        toteId,
        ...(e.code ? { code: e.code } : {}),
        ...(e.productId ? { productId: e.productId } : {}),
        ...(e.orderId ? { orderId: e.orderId } : {}),
        ...(e.ms !== undefined ? { ms: Math.round(e.ms) } : {}),
        ...(raised && raised.productId === e.productId
          ? { dispute: { id: raised.id, kind: raised.kind, qty: raised.qty } }
          : {}),
      });
    }
    return out;
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
        const id =
          who.data && port.get().openStation(who.data.staffId, station, who.data.permissions);
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
    deviceJournal: async (id) => {
      if (onServer(port)) return desks.journal(id);
      // Демо: отметки и сканы, пришедшие с этого устройства.
      return attempt(() =>
        port
          .get()
          .staffEvents.filter((e) => e.deviceId === id)
          .map((e) => ({ at: e.at, staffRef: e.staffId, kind: e.type }))
          .sort((a, b) => b.at - a.at)
          .slice(0, 200),
      );
    },
    unbindDevice: async (code) => {
      if (onServer(port)) {
        // Неотправленная работа живёт только в очереди этого стола: под входом
        // руководителя её выбросят, а копия затрётся сервером.
        if (ops.pending().count > 0) return fail("ws.device.queueNotEmpty");
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
        return who.data && port.get().unbindAs(who.data.staffId)
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
    packItem: (code) => attempt(() => queuePack(() => port.get().packScanItem(code))),
    packLabel: async (code) => {
      const res = await attempt(() => queuePack(() => port.get().packScanLabel(code)));
      if (!res.ok) return res;
      return res.data ? ok(undefined) : fail("ws.label.wrong");
    },
    packReject: () => attempt(() => queuePack(() => port.get().packRejectPending())),
    // Сборка на сервере уходит операциями (`cabinet/deskPick.js`): стор уже
    // снял штуку, очередь донесёт факт «откуда, куда, под какую заявку».
    pickUnit: (requestId, productId, addr, toteId) =>
      attempt(() => {
        const s = port.get();
        const by = s.stationSession?.staffId;
        const before = s.requests.find((r) => r.id === requestId)?.pickedQty ?? 0;
        const known = new Set(s.staffEvents.map((e) => e.id));
        const now = s.recordPick(requestId, productId, addr, toteId, by);
        if (now === before || !by || !onServer(port)) return now;
        const ev = port.get().staffEvents.find((e) => !known.has(e.id) && e.type === "pick_scan");
        if (ev && toteId) {
          ops.enqueue("pick_unit", {
            eventId: ev.id,
            staffId: by,
            at: ev.at,
            requestId,
            productId,
            toteId,
            cell: addr,
          });
        }
        return now;
      }),
    // Рейс на сервере уходит операцией (`cabinet/deskShip.js`): стор уже
    // отметил уехавшее, очередь донесёт «эти заявки, эти места, эта машина».
    ship: (requestIds, info) =>
      attempt(() => {
        const id = port.get().shipRequests(requestIds, info);
        const by = port.get().stationSession?.staffId;
        if (!id || !by || !onServer(port)) return id;
        const run = port.get().shipments.find((s) => s.id === id);
        if (run) {
          ops.enqueue("ship_run", {
            eventId: id,
            staffId: by,
            at: run.shippedAt,
            requestIds: run.requestIds,
            vehicle: run.vehicle ?? "",
            units: run.units ?? [],
          });
        }
        return id;
      }),
    pickDone: (requestId, partial) =>
      attempt(() => {
        port.get().completeRequest(requestId, partial);
        const by = port.get().stationSession?.staffId;
        if (by && onServer(port)) {
          ops.enqueue("pick_done", {
            eventId: uid("pd"),
            staffId: by,
            at: nowMs(),
            requestId,
            partial,
          });
        }
      }),
    packFinish: async () => {
      const res = await attempt(() => port.get().packFinish());
      if (!res.ok) return res;
      const f = res.data;
      if (f && onServer(port)) {
        ops.enqueue("pack_done", {
          eventId: f.eventId,
          staffId: f.staffId,
          at: f.at,
          toteId: f.toteId,
          outboundCode: f.outboundCode,
          ...(f.outboundId ? { outboundId: f.outboundId } : {}),
          lines: f.lines,
          requestIds: f.requestIds,
          shortages: f.shortages,
        });
      }
      return ok(undefined);
    },
  };
}

export const workstationRepository = createWorkstationRepository();
