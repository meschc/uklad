import type { ItemScan } from "../packing";
import { deviceNameError } from "../deviceName";
import type { CountLine } from "../inventory";
import type {
  CellAddress,
  Device,
  IdleReason,
  OutboundBox,
  ShiftMark,
  StaffEvent,
  WorkstationKind,
} from "../types";
import { onServer, serverBadges, type BadgeServer } from "./badgeRepository";
import {
  serverDesks,
  type BindConfirm,
  type DeskServer,
  type DeviceJournalData,
} from "./deskServer";
import { isStaffEvent } from "./guards";
import { deskOps, type OpQueue } from "./opQueue";
import { readList, storePort, type StorePort } from "./repository";
import { attempt, fail, ok, type Result } from "./result";
import { nowMs, uid } from "../utils";
import { stationsFor } from "../stationSwitch";

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
  addDevice: (
    name: string,
    station: WorkstationKind,
    confirm?: BindConfirm,
  ) => Promise<Result<Device>>;
  revokeDevice: (id: string) => Promise<Result<void>>;
  /**
   * Убрать отключённое устройство из списка. Пропуск стола на сервере уже
   * погашен отключением, журнал операций остаётся на сервере.
   */
  forgetDevice: (id: string) => Promise<Result<void>>;
  /** Журнал устройства: кто и что делал за ним, новые сверху. */
  deviceJournal: (id: string) => Promise<Result<DeviceJournalData>>;
  /** Отвязать этот браузер бейджем руководителя. Чужой бейдж — `ws.device.notManager`. */
  unbindDevice: (managerBadge: string) => Promise<Result<void>>;
  /**
   * Отвязать этот стол паролем руководителя (только с сервером): бейджа
   * старшего нет — стол всё равно отвязывается на месте.
   */
  unbindDeviceByPassword: (email: string, password: string) => Promise<Result<void>>;
  /** Начать тару: скан тары с товаром и короба отгрузки. */
  packStart: (sourceCode: string, targetCode?: string) => Promise<Result<void>>;
  packItem: (code: string) => Promise<Result<ItemScan>>;
  /**
   * Заказ в двух тарах: пересыпать отсканированную тару в тару на столе
   * (`toteMerge.ts`). Нельзя — отказ `ws.merge.<причина>`.
   */
  packMerge: (code: string) => Promise<Result<void>>;
  /**
   * Старший перекладывает тару целиком (`pack_move`). Нельзя — отказ
   * `ws.move.<причина>`.
   */
  seniorMove: (fromCode: string, toCode: string) => Promise<Result<void>>;
  /** Скан наклеенной этикетки. Не та этикетка — отказ `ws.label.wrong`. */
  packLabel: (code: string) => Promise<Result<void>>;
  packReject: () => Promise<Result<void>>;
  /** Остановить стол сортировки/погрузки до бейджа старшего (`null` — снять). */
  lockStation: (station: "sort" | "ship", code: string | null) => Promise<Result<void>>;
  /** Не та этикетка — в счётчик ошибок сессии. Только счёт: товар и сервер не трогает. */
  packLabelMistake: (code: string) => Promise<Result<void>>;
  /** Перепечатка этикетки — запись в журнал стола, без подтверждения. */
  packReprint: (code: string) => Promise<Result<void>>;
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
  /**
   * Отменить свой скан сборки: штука из тары — обратно в короб, откуда её
   * сняли. Нельзя — отказ `pick.undo.<причина>` (`pickUndo.ts`).
   */
  pickUndo: (pickId: string) => Promise<Result<void>>;
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
  /**
   * Инвентаризация: слепой пересчёт тары на полке. Ответ — сошлось ли с
   * учётом; сами числа учёта сотруднику не возвращаются. Не получилось —
   * отказ `ws.count.<причина>`.
   */
  countBox: (boxId: string, lines: CountLine[]) => Promise<Result<{ matched: boolean }>>;
  /** Пересчёт ячейки без тары: «пусто» или найденное в свободной таре `boxId`. */
  countCell: (
    cell: CellAddress,
    lines: CountLine[],
    boxId?: string,
  ) => Promise<Result<{ found: number }>>;
  /** Сортировка: короб отгрузки — на паллету назначения. Правила проверяет стол. */
  sort: (parcelCode: string, sortCode: string) => Promise<Result<boolean>>;
  /** Закрыть отгрузку места сортировки: грузовые места (`UK-OUT-`) для ярлыков. */
  sortClose: (sortCode: string, pallets: number, boxes: number) => Promise<Result<OutboundBox[]>>;
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
        // Без роли сервер не примет ни одной операции: не пускаем к работе,
        // а говорим, к кому идти.
        if (who.data && who.data.permissions === null) return fail("ws.badgeNoRole");
        // Роль есть, но не на этот процесс: раньше стол пускал упаковщика на
        // приёмку, а сервер потом отказывал на каждой операции (обход 15.11).
        if (who.data) {
          const s = port.get();
          const dev = (s.devices ?? []).find((d) => d.id === s.thisDeviceId && !d.revokedAt);
          const here = dev?.station ?? station;
          if (!stationsFor(who.data.permissions).includes(here)) return fail("ws.badgeNoStation");
        }
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
    addDevice: async (name, station, confirm) => {
      const bad = deviceNameError(name);
      if (bad) return fail(bad);
      if (onServer(port)) {
        // Сначала — что руководитель подтверждён: иначе каждый отказ оставлял
        // бы у себя заведённое и тут же погашенное устройство.
        const allowed = await desks.checkBind(confirm, port.get().warehouse?.id ?? "");
        if (!allowed.ok) return allowed;
      }
      const made = await attempt(() => port.get().addDevice(name, station));
      if (!made.ok || !onServer(port)) return made;
      // На сервере компьютер становится столом по-настоящему: вход
      // руководителя здесь гаснет, остаётся пропуск стола с узким правом.
      const opened = await desks.open(made.data.id, made.data.name, confirm);
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
    forgetDevice: async (id) => {
      const d = port.get().devices.find((x) => x.id === id);
      if (!d) return ok(undefined);
      if (!d.revokedAt) return fail("devices.forgetLive");
      return attempt(() => port.get().forgetDevice(id));
    },
    deviceJournal: async (id) => {
      if (onServer(port)) return desks.journal(id);
      // Демо: отметки и сканы, пришедшие с этого устройства.
      return attempt(() => ({
        entries: port
          .get()
          .staffEvents.filter((e) => e.deviceId === id)
          .map((e) => ({
            at: e.at,
            staffRef: e.staffId,
            kind: e.type,
            refs:
              e.productId || e.orderId || e.code
                ? { productId: e.productId, orderId: e.orderId, code: e.code }
                : undefined,
          }))
          .sort((a, b) => b.at - a.at)
          .slice(0, 200),
      }));
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
    unbindDeviceByPassword: async (email, password) => {
      if (!onServer(port)) return fail("data.failed");
      if (!email.trim() || !password) return fail("login.err.badCredentials");
      // Как и бейджем: неотправленная работа живёт только в очереди стола.
      if (ops.pending().count > 0) return fail("ws.device.queueNotEmpty");
      const res = await desks.unbindByPassword(email.trim(), password);
      if (!res.ok) return res;
      if (!res.data) return fail("ws.device.notManagerAccount");
      const s = port.get();
      if (s.thisDeviceId) s.revokeDevice(s.thisDeviceId);
      // Сервер вместе с отвязкой открыл вход руководителя (почта и пароль
      // только что введены): экран входа узнает куку и сразу пустит в
      // кабинет, второго такого же входа нет (Кирилл 20.11).
      s.sessionLost(email.trim().toLowerCase());
      return ok(undefined);
    },
    packStart: async (source, target) => {
      const res = await attempt(() => port.get().packStart(source, target));
      if (!res.ok) return res;
      return res.data ? fail(res.data) : ok(undefined);
    },
    packItem: (code) => attempt(() => queuePack(() => port.get().packScanItem(code))),
    packMerge: async (code) => {
      const res = await attempt(() => port.get().packMergeTote(code));
      if (!res.ok) return res;
      const out = res.data;
      if ("problem" in out) return fail(`ws.merge.${out.problem}` as const);
      const s = port.get();
      const ev = s.staffEvents.find((e) => e.id === out.id);
      if (ev && s.packSession && onServer(port)) {
        ops.enqueue("pack_merge", {
          eventId: ev.id,
          staffId: ev.staffId,
          at: ev.at,
          toteId: s.packSession.sourceBoxId,
          fromToteId: out.fromId,
        });
      }
      return ok(undefined);
    },
    seniorMove: async (fromCode, toCode) => {
      const res = await attempt(() => port.get().seniorMoveTote(fromCode, toCode));
      if (!res.ok) return res;
      const out = res.data;
      if ("problem" in out) return fail(`ws.move.${out.problem}` as const);
      const ev = port.get().staffEvents.find((e) => e.id === out.id);
      if (ev && onServer(port)) {
        ops.enqueue("pack_move", {
          eventId: ev.id,
          staffId: ev.staffId,
          at: ev.at,
          toteId: out.toId,
          fromToteId: out.fromId,
        });
      }
      return ok(undefined);
    },
    packLabel: async (code) => {
      const res = await attempt(() => queuePack(() => port.get().packScanLabel(code)));
      if (!res.ok) return res;
      return res.data ? ok(undefined) : fail("ws.label.wrong");
    },
    packReject: () => attempt(() => queuePack(() => port.get().packRejectPending())),
    lockStation: async (station, code) =>
      attempt(() => port.get().setStationLock(code ? { station, code } : null)),
    packLabelMistake: async (code) => attempt(() => port.get().packLabelMistake(code)),
    packReprint: (code) => attempt(() => queuePack(() => port.get().packLogReprint(code))),
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
    // Отмена на сервере — своя операция (`applyPickUndo`): сервер сам
    // проверит, что скан свой, штука в таре и короб на месте.
    pickUndo: async (pickId) => {
      const by = port.get().stationSession?.staffId;
      if (!by) return fail("pick.undo.not_yours");
      const res = await attempt(() => port.get().undoPick(pickId, by));
      if (!res.ok) return res;
      const out = res.data;
      if ("problem" in out) return fail(`pick.undo.${out.problem}` as const);
      const ev = port.get().staffEvents.find((e) => e.id === out.id);
      if (ev && onServer(port)) {
        ops.enqueue("pick_undo", { eventId: ev.id, staffId: by, at: ev.at, pickId });
      }
      return ok(undefined);
    },
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
    // Пересчёт на сервере уходит операцией (`cabinet/deskInventory.js`):
    // сервер сам сравнит с учётом и заведёт спорное, стол числа учёта не знает.
    countBox: async (boxId, lines) => {
      const by = port.get().stationSession?.staffId;
      if (!by) return fail("ws.count.nobody");
      const eventId = uid("ic");
      const at = nowMs();
      const res = await attempt(() =>
        port.get().countBox({ boxId, lines, staffId: by, at, eventId }),
      );
      if (!res.ok) return res;
      if ("problem" in res.data) return fail(`ws.count.${res.data.problem}`);
      if (onServer(port)) {
        ops.enqueue("inv_count", { eventId, staffId: by, at, boxId, lines });
      }
      return ok({ matched: res.data.diffs.length === 0 });
    },
    // Пустая ячейка — операцией `inv_cell`: «пусто» остаётся строкой журнала
    // операций стола, найденное — излишком на свободную тару.
    countCell: async (cell, lines, boxId) => {
      const by = port.get().stationSession?.staffId;
      if (!by) return fail("ws.count.nobody");
      const eventId = uid("icc");
      const at = nowMs();
      const res = await attempt(() =>
        port.get().countCell({ cell, lines, boxId, staffId: by, at, eventId }),
      );
      if (!res.ok) return res;
      if ("problem" in res.data) return fail(`ws.count.${res.data.problem}`);
      if (onServer(port)) {
        ops.enqueue("inv_cell", { eventId, staffId: by, at, cell, lines, boxId });
      }
      return ok({ found: res.data.found });
    },
    // Сортировка уходит операциями `sort_place` и `sort_close`: сервер сам
    // сверит направление места и что отгрузка ещё не закрыта.
    sort: (parcelCode, sortCode) =>
      attempt(() => {
        const s = port.get();
        const placed = s.sortPlace(parcelCode, sortCode);
        const by = s.stationSession?.staffId;
        if (!placed || !by || !onServer(port)) return placed;
        ops.enqueue("sort_place", {
          eventId: uid("sort"),
          staffId: by,
          at: nowMs(),
          outboundCode: parcelCode,
          sortCode,
        });
        return placed;
      }),
    sortClose: async (sortCode, pallets, boxes) => {
      const res = await attempt(() => port.get().sortClose(sortCode, pallets, boxes));
      if (!res.ok) return res;
      if (!res.data) return fail("ws.sort.closeFailed");
      const by = port.get().stationSession?.staffId;
      if (by && onServer(port)) {
        ops.enqueue("sort_close", {
          eventId: uid("sortc"),
          staffId: by,
          at: res.data[0].createdAt,
          sortCode,
          pallets,
          boxes,
          placeIds: res.data.map((p) => p.id),
        });
      }
      return ok(res.data);
    },
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
      for (const f of onServer(port) ? (res.data ?? []) : []) {
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
