import type { CellAddress, StaffEvent } from "./types";

/**
 * Журнал действий склада (экран «Журнал действий», миграция 044).
 *
 * Кирилл 15.11: посекундная история всего, что делали на складе, — чтобы
 * решать спорное («кто положил не в ту тару») и потом сверять с камерами.
 * На сервере строки собирает `server/api/src/cabinet/journal.js` из операций
 * столов и правок кабинета; в демо — из журнала смен этого браузера.
 *
 * Здесь только правила без хранилища: процессы, «ошибка ли», склейка страниц.
 */

/** Процесс, к которому относится действие (`desk_ops.step` на сервере). */
export type JournalStep =
  | "receive"
  | "place"
  | "pick"
  | "pack"
  | "label"
  | "sort"
  | "ship"
  | "inventory"
  | "dispute"
  | "shift"
  | "cabinet";

/** Виды операций стола на сервере (`desk_ops.kind`) — подписи `devices.op.*`. */
export const DESK_KINDS: ReadonlySet<string> = new Set([
  "shift_mark",
  "shift_undo",
  "pack_event",
  "pack_done",
  "pick_unit",
  "pick_done",
  "pick_undo",
  "recv_open",
  "recv_unit",
  "recv_place",
  "recv_attach",
  "recv_close",
  "recv_cargo",
  "ship_run",
  "dispute_resolve",
  "sort_place",
  "sort_close",
  "inv_count",
  "inv_cell",
  "station_switch",
]);

/** Порядок процессов в фильтре — как товар идёт по складу. */
export const JOURNAL_STEPS: readonly JournalStep[] = [
  "receive",
  "place",
  "pick",
  "pack",
  "label",
  "sort",
  "ship",
  "inventory",
  "dispute",
  "shift",
  "cabinet",
];

export interface JournalMove {
  kind: "box" | "outbound" | "cell" | "box_at";
  ref: string;
  productId: string;
  delta: number;
}

export interface ActivityEntry {
  id: string;
  /** Когда случилось на устройстве, мс. */
  at: number;
  /** Когда дошло до сервера, мс: часы ТСД могут врать. */
  receivedAt: number;
  /** Стол склада, правка в кабинете или (демо) журнал смен браузера. */
  source: "desk" | "cabinet" | "local";
  /** Сотрудник склада (`warehouse.staff[].id`); нет — за столом никого. */
  staffRef: string | null;
  device?: { ref: string; name: string };
  /** Кто правил кабинет: участник команды. */
  member?: { id: string; name: string | null };
  /** Вид операции стола (`desk_ops.kind`), отметки журнала смен или `cabinet_edit`. */
  kind: string;
  step: JournalStep | "other";
  /** «Пик за единицу работы»: штука снята, принята, упакована, посылка разложена. */
  counted: boolean;
  /** Сервер не принял факт как есть — разбирает старший. */
  flagged: boolean;
  reason?: string;
  refs?: {
    type?: string;
    productId?: string;
    toteId?: string;
    boxId?: string;
    palletId?: string;
    orderId?: string;
    /** Заказ скана сборки (`pick_unit`). */
    requestId?: string;
    outboundCode?: string;
    sortCode?: string;
    code?: string;
    qty?: number;
    cell?: CellAddress;
    dispute?: string;
    /** Куда перешёл сотрудник (`station_switch`) и кто из старших разрешил. */
    station?: string;
    approvedBy?: string;
    /** Машина рейса (`ship_run`). */
    vehicle?: string;
  };
  moves?: JournalMove[];
  movesTotal?: number;
}

export interface JournalFilters {
  steps?: JournalStep[];
  staff?: string;
  product?: string;
  /** Тара, паллета, короб отгрузки или место сортировки — по id или коду. */
  place?: string;
  /** Только ошибки: помеченное сервером, скан не того, брак. */
  errors?: boolean;
  /** Не новее этого момента, мс. */
  before?: number;
}

const ERROR_TYPES = new Set(["pack_error", "pack_reject"]);

/** Ошибка или отказ: такие строки журнал подсвечивает и фильтрует отдельно. */
export const isJournalError = (e: ActivityEntry): boolean =>
  e.flagged ||
  !!e.refs?.dispute ||
  ERROR_TYPES.has(e.refs?.type ?? "") ||
  // Отмена скана сборки (миграция 043): сборщик ошибся — разбор ищет и это.
  e.kind === "pick_undo";

/**
 * Свежая страница поверх уже показанного: тот же id — одна строка, новые
 * сверху. Граница страницы на сервере включительна, поэтому повторы — норма.
 */
export function mergeEntries(
  shown: readonly ActivityEntry[],
  page: readonly ActivityEntry[],
): ActivityEntry[] {
  const byId = new Map<string, ActivityEntry>();
  for (const e of shown) byId.set(e.id, e);
  for (const e of page) byId.set(e.id, e);
  return [...byId.values()].sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : -1));
}

const LOCAL_STEP: Record<StaffEvent["type"], JournalStep> = {
  shift_start: "shift",
  shift_end: "shift",
  break_start: "shift",
  break_end: "shift",
  idle_start: "shift",
  idle_end: "shift",
  pack_scan: "pack",
  pack_error: "pack",
  pack_reject: "pack",
  pack_label: "label",
  pack_reprint: "label",
  pack_done: "pack",
  pick_scan: "pick",
  pick_undo: "pick",
};

/** Демо без сервера: журнал смен этого браузера теми же строками и фильтрами. */
export function localJournal(
  events: readonly StaffEvent[],
  f: JournalFilters,
  limit = 100,
): ActivityEntry[] {
  const out: ActivityEntry[] = [];
  for (const e of events) {
    const step = LOCAL_STEP[e.type] ?? "other";
    const entry: ActivityEntry = {
      id: e.id,
      at: e.at,
      receivedAt: e.at,
      source: "local",
      staffRef: e.staffId,
      kind: e.type,
      step,
      counted: e.type === "pack_scan" || e.type === "pick_scan",
      flagged: false,
      refs: {
        type: e.type,
        ...(e.productId ? { productId: e.productId } : {}),
        ...(e.orderId ? { orderId: e.orderId } : {}),
        ...(e.code ? { code: e.code } : {}),
      },
    };
    if (f.before !== undefined && e.at > f.before) continue;
    if (f.steps?.length && !f.steps.includes(step)) continue;
    if (f.staff && e.staffId !== f.staff) continue;
    if (f.product && e.productId !== f.product) continue;
    if (f.place && e.code !== f.place) continue;
    if (f.errors && !isJournalError(entry)) continue;
    out.push(entry);
  }
  return out.sort((a, b) => b.at - a.at).slice(0, limit);
}

/** Строка адреса для запроса журнала на сервере. */
export function journalQuery(warehouse: string, f: JournalFilters, before?: number): string {
  const p = new URLSearchParams({ warehouse });
  if (f.steps?.length) p.set("steps", f.steps.join(","));
  if (f.staff) p.set("staff", f.staff);
  if (f.product) p.set("product", f.product);
  if (f.place) p.set("place", f.place);
  if (f.errors) p.set("errors", "1");
  const edge = before ?? f.before;
  if (edge !== undefined) p.set("before", String(edge));
  return p.toString();
}
