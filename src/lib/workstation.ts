import { groupRequestsByTarget } from "./fulfillment";
import { matchesProductCode, normalizeCode } from "./barcode";
import type { FulfillmentRequest, Product, StaffEvent, StationSession } from "./types";

/**
 * Рабочее место и смена сотрудника — чистые правила, о хранилище не знают.
 *
 * Здесь три вещи, которые ошибаются молча: в каком состоянии смена, сколько
 * часов отработано (и значит, сколько заработано) и совпал ли отсканированный
 * товар с заказом. Неверный ответ в любой из них выглядит как обычный — его
 * заметят только в день зарплаты или по возврату от покупателя.
 */

/** Префикс бейджа сотрудника. Латиницей, как и номера тары: так его читает любой сканер. */
export const BADGE_PREFIX = "UK-STF-";

/** Вход по бейджу живёт одну смену с запасом (узел карты «вход на ТСД по QR»). */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * Код, который печатается на бейдже сотрудника.
 *
 * ТОЛЬКО ДЛЯ ДЕМО БЕЗ СЕРВЕРА. Бейдж держится на одном id: кто видел чужой
 * бейдж или знает id, напечатает копию и войдёт за другого — смены и заработок
 * запишутся на того человека. На сервере в QR кладём случайный секрет бейджа
 * (не меньше 128 бит), который отзывается и перевыпускается при потере, а id в
 * коде не бывает вовсе. Переносить эту функцию на сервер как есть нельзя.
 */
export function badgeCode(staffId: string): string {
  return `${BADGE_PREFIX}${staffId}`;
}

/**
 * Достать id сотрудника из скана бейджа. Регистр не важен: дешёвые сканеры
 * иногда отдают строку в другом регистре, чем она напечатана.
 */
export function parseBadge(raw: string): string | null {
  const code = raw.trim();
  if (code.toUpperCase().startsWith(BADGE_PREFIX)) {
    const id = code.slice(BADGE_PREFIX.length);
    return id || null;
  }
  return null;
}

export function isSessionLive(session: StationSession | null, now: number): boolean {
  return !!session && now < session.expiresAt;
}

// --- Смена ----------------------------------------------------------------------

export type ShiftState = "off" | "on" | "break";

const SHIFT_TYPES = new Set(["shift_start", "break_start", "break_end", "shift_end"]);

/** Отметки смены одного сотрудника по времени. Сканы и упаковки в счёт часов не входят. */
function shiftMarks(events: readonly StaffEvent[], staffId: string): StaffEvent[] {
  return events
    .filter((e) => e.staffId === staffId && SHIFT_TYPES.has(e.type))
    .sort((a, b) => a.at - b.at);
}

/** Где сейчас сотрудник: не на смене, работает или на перерыве. */
export function shiftState(events: readonly StaffEvent[], staffId: string): ShiftState {
  const last = shiftMarks(events, staffId).at(-1);
  if (!last || last.type === "shift_end") return "off";
  return last.type === "break_start" ? "break" : "on";
}

/** Какие отметки допустимы из состояния — кнопки меню и проверка команды одни. */
export function allowedMarks(state: ShiftState): StaffEvent["type"][] {
  if (state === "off") return ["shift_start"];
  if (state === "break") return ["break_end", "shift_end"];
  return ["break_start", "shift_end"];
}

/**
 * Отработанное время в окне [from, to): только «на смене», перерывы не входят.
 *
 * Считаем по переходам, а не по парам «начал — закончил»: человек забывает
 * отметить конец перерыва и сразу закрывает смену, и парный подсчёт тогда
 * засчитал бы ему весь перерыв как работу (или потерял бы всю смену). Здесь
 * каждый отрезок между соседними отметками честно принадлежит одному состоянию.
 * Открытая смена считается до `to` — обычно это «сейчас».
 */
export function workedMs(
  events: readonly StaffEvent[],
  staffId: string,
  from: number,
  to: number,
): number {
  let total = 0;
  let state: ShiftState = "off";
  let since = 0;
  const add = (end: number) => {
    if (state !== "on") return;
    const a = Math.max(since, from);
    const b = Math.min(end, to);
    if (b > a) total += b - a;
  };
  for (const e of shiftMarks(events, staffId)) {
    if (e.at >= to) break;
    add(e.at);
    if (e.type === "shift_start" || e.type === "break_end") state = "on";
    else if (e.type === "break_start") state = "break";
    else state = "off";
    since = e.at;
  }
  add(to);
  return total;
}

/** Заработок за отработанное время, ₽, округлён до рубля. Без ставки — null, а не ноль. */
export function earnings(ms: number, hourlyRate: number | undefined): number | null {
  if (!hourlyRate || hourlyRate <= 0) return null;
  return Math.round((ms / 3_600_000) * hourlyRate);
}

/** Начало суток по местному времени — окно «сегодня» в меню сотрудника. */
export function startOfDay(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Начало месяца — окно «за месяц». */
export function startOfMonth(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d.getTime();
}

// --- Упаковка -------------------------------------------------------------------

/** Заказ на упаковку: собранные заявки одного назначения — одна посылка. */
export interface PackOrder {
  /** Номер заказа: id первой заявки — стабилен, пока заказ не упакован. */
  id: string;
  target: string | null;
  requests: FulfillmentRequest[];
  /** Сколько единиц должно лечь в коробку всего. */
  units: number;
}

/**
 * Очередь упаковщика: собранные («done»), ещё не упакованные и не уехавшие
 * заявки, сложенные по назначению. Назначение, а не дата — по той же причине,
 * что и в «Заданиях»: в одну коробку едет то, что едет одному получателю.
 * Собранное частично пакуется тем, что собрали, а не тем, что просили.
 */
export function packQueue(requests: readonly FulfillmentRequest[]): PackOrder[] {
  const ready = requests.filter((r) => r.status === "done" && !r.packedAt);
  return groupRequestsByTarget(ready).map((g) => ({
    id: g.items[0].id,
    target: g.target,
    requests: g.items,
    units: g.items.reduce((n, r) => n + packQty(r), 0),
  }));
}

/** Сколько единиц этой заявки кладут в коробку. */
export function packQty(r: FulfillmentRequest): number {
  return r.partial ? (r.pickedQty ?? 0) : r.qty;
}

/** Сколько единиц каждого товара должно оказаться в коробке. */
export function packPlan(order: PackOrder): Map<string, number> {
  const plan = new Map<string, number>();
  for (const r of order.requests) plan.set(r.productId, (plan.get(r.productId) ?? 0) + packQty(r));
  return plan;
}

export type PackScanResult =
  | { kind: "ok"; productId: string }
  /** Товар есть в заказе, но его уже положили столько, сколько нужно. */
  | { kind: "extra"; productId: string }
  /** Товар склада, но в этом заказе его нет — самая дорогая ошибка упаковки. */
  | { kind: "wrong"; productId: string }
  | { kind: "unknown" };

/**
 * Проверить скан против заказа. Каждая единица сканируется отдельно — как на
 * сборке: «пересчитал глазами» здесь и есть место, где в коробку уезжает
 * соседний артикул.
 */
export function checkPackScan(
  order: PackOrder,
  packed: ReadonlyMap<string, number>,
  products: readonly Product[],
  raw: string,
): PackScanResult {
  if (!normalizeCode(raw)) return { kind: "unknown" };
  const plan = packPlan(order);
  // Сначала ищем среди товаров заказа: совпадение артикула чужого товара со
  // штрихкодом нашего не должно уводить скан в «не тот товар».
  const inOrder = products.filter((p) => plan.has(p.id));
  const product =
    inOrder.find((p) => matchesProductCode(p, raw)) ??
    products.find((p) => matchesProductCode(p, raw));
  if (!product) return { kind: "unknown" };
  const need = plan.get(product.id);
  if (need == null) return { kind: "wrong", productId: product.id };
  if ((packed.get(product.id) ?? 0) >= need) return { kind: "extra", productId: product.id };
  return { kind: "ok", productId: product.id };
}

/** Всё ли положено: каждая позиция ровно в нужном количестве. */
export function isPackComplete(order: PackOrder, packed: ReadonlyMap<string, number>): boolean {
  for (const [id, need] of packPlan(order)) if ((packed.get(id) ?? 0) < need) return false;
  return true;
}
