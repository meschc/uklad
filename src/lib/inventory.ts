import type { Box, Dispute } from "./types";
import { isInventoryDispute } from "./disputes";

/**
 * Инвентаризация: слепой пересчёт тары на месте хранения.
 *
 * Сотрудник сканирует тару, считает, что в ней лежит, и вводит числа. Что
 * должно быть по учёту, он не видит: иначе числа подгоняют под учёт. Разницу
 * считаем здесь, а решает по ней старший (спорное `inventory_short` и
 * `inventory_over`). Сам пересчёт остатков не двигает — только факт и спорное.
 *
 * Те же правила повторяет сервер (`server/api/src/cabinet/deskInventory.js`):
 * менять их нужно в обоих местах.
 */

export interface CountLine {
  productId: string;
  qty: number;
}

export interface CountDiff {
  productId: string;
  /** По учёту. Сотруднику не показывается. */
  expected: number;
  /** По пересчёту. */
  counted: number;
}

/** Предел одной строки: опечатка в лишний ноль не должна оприходовать склад. */
export const MAX_COUNT_QTY = 100_000;
/** Сколько разных товаров может быть в одном пересчёте. */
const MAX_COUNT_LINES = 200;
/** Через сколько дней тара считается давно не считанной. */
export const COUNT_STALE_DAYS = 30;

/** Схлопнуть одинаковые товары; null — число не целое, отрицательное или слишком большое. */
export function normalizeCount(lines: readonly CountLine[]): CountLine[] | null {
  const sum = new Map<string, number>();
  for (const l of lines) {
    if (typeof l.productId !== "string" || !l.productId) return null;
    if (!Number.isInteger(l.qty) || l.qty < 0 || l.qty > MAX_COUNT_QTY) return null;
    sum.set(l.productId, (sum.get(l.productId) ?? 0) + l.qty);
  }
  if (sum.size > MAX_COUNT_LINES) return null;
  const out = [...sum].map(([productId, qty]) => ({ productId, qty }));
  return out.some((l) => l.qty > MAX_COUNT_QTY) ? null : out;
}

/** Расхождения по товарам: только те, где число не сошлось. */
export function countDiffs(box: Pick<Box, "lines">, counted: readonly CountLine[]): CountDiff[] {
  const expected = new Map<string, number>();
  for (const l of box.lines) expected.set(l.productId, (expected.get(l.productId) ?? 0) + l.qty);
  const got = new Map(counted.map((l) => [l.productId, l.qty]));
  const out: CountDiff[] = [];
  for (const productId of new Set([...expected.keys(), ...got.keys()])) {
    const e = expected.get(productId) ?? 0;
    const c = got.get(productId) ?? 0;
    if (e !== c) out.push({ productId, expected: e, counted: c });
  }
  return out.sort((a, b) => a.productId.localeCompare(b.productId));
}

/** Id спорного по результату пересчёта: повтор той же операции его не задвоит. */
const inventoryDisputeId = (eventId: string, productId: string): string =>
  `inv-${eventId}-${productId}`.slice(0, 100);

/**
 * Почему пересчитать нельзя:
 *   · `no_box` — такой тары нет;
 *   · `not_stored` — тара не на месте хранения (или невскрытое место): считать
 *     можно только то, что стоит на полке;
 *   · `open` — по этой таре старший ещё не решил прошлое расхождение;
 *   · `bad` — числа не годятся;
 *   · `unknown_product` — товара нет в каталоге.
 */
export type CountProblem = "no_box" | "not_stored" | "open" | "bad" | "unknown_product";

export interface CountInput {
  boxId: string;
  lines: readonly CountLine[];
  staffId: string;
  at: number;
  eventId: string;
}

export type CountPlan =
  { problem: CountProblem } | { box: Box; disputes: Dispute[]; diffs: CountDiff[] };

/**
 * Что даст пересчёт: тара с отметкой и новые спорные. Остатки не трогает.
 * `known` — id товаров каталога: найти можно и товар, которого по учёту в
 * таре не было, но не товар, которого нет вовсе.
 */
export function planCount(
  boxes: readonly Box[],
  disputes: readonly Dispute[],
  known: ReadonlySet<string>,
  input: CountInput,
): CountPlan {
  const box = boxes.find((b) => b.id === input.boxId);
  if (!box) return { problem: "no_box" };
  if (!box.address || box.sealed) return { problem: "not_stored" };
  const lines = normalizeCount(input.lines);
  if (!lines) return { problem: "bad" };
  if (lines.some((l) => !known.has(l.productId))) return { problem: "unknown_product" };
  if (disputes.some((d) => !d.resolution && isInventoryDispute(d) && d.boxId === box.id)) {
    return { problem: "open" };
  }
  const diffs = countDiffs(box, lines);
  return {
    box: { ...box, countedAt: input.at, countedBy: input.staffId },
    diffs,
    disputes: diffs.map((d) => ({
      id: inventoryDisputeId(input.eventId, d.productId),
      kind: d.counted < d.expected ? "inventory_short" : "inventory_over",
      boxId: box.id,
      toteCode: box.barcode,
      productId: d.productId,
      qty: Math.abs(d.counted - d.expected),
      raisedBy: input.staffId,
      raisedAt: input.at,
    })),
  };
}

/** Тара на полках, которую давно не считали или не считали ни разу: сначала самые давние. */
export function staleBoxes(boxes: readonly Box[], now: number): Box[] {
  const limit = now - COUNT_STALE_DAYS * 24 * 3600 * 1000;
  return boxes
    .filter((b) => b.address && !b.sealed && (b.countedAt ?? 0) < limit)
    .sort((a, b) => (a.countedAt ?? 0) - (b.countedAt ?? 0));
}

/** Сколько тары на полках уже пересчитано за срок и сколько всего. */
export function countCoverage(
  boxes: readonly Box[],
  now: number,
): { counted: number; total: number } {
  const stored = boxes.filter((b) => b.address && !b.sealed);
  const stale = new Set(staleBoxes(stored, now).map((b) => b.id));
  return { counted: stored.length - stale.size, total: stored.length };
}
