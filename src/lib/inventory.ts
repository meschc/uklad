import type { Box, CellAddress, Dispute, Pallet } from "./types";
import { freeInBox, isInventoryDispute } from "./disputes";

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

/**
 * Пересчёт ячейки, где по учёту тары нет (сервер — `applyInvCell`). Почему
 * нельзя: `busy` — по учёту в ячейке уже есть тара, паллета или товар
 * (`cellTaken`); `no_tote` — найденное без свободной тары не принять;
 * `tote_busy` — тара не свободна (с товаром, невскрытая, на паллете или на
 * другом месте); остальное — как у тары.
 */
export type CellCountProblem = "busy" | "no_tote" | "tote_busy" | "bad" | "unknown_product";

export interface CellCountInput {
  cell: CellAddress;
  /** Свободная тара, куда положили найденное. Пусто — ячейка пуста. */
  boxId?: string;
  lines: readonly CountLine[];
  staffId: string;
  at: number;
  eventId: string;
}

const sameCell = (a: CellAddress | undefined, b: CellAddress) =>
  !!a &&
  a.floorId === b.floorId &&
  a.moduleId === b.moduleId &&
  a.shelfIndex === b.shelfIndex &&
  a.cellIndex === b.cellIndex;

/** Что лежит на складе по учёту: тара, паллеты и товар прямо в ячейках. */
export interface CellPlace {
  boxes: readonly Box[];
  pallets: readonly Pallet[];
  placements: Readonly<Record<string, CellAddress>>;
}

/**
 * По учёту в ячейке уже что-то есть: тара (любая, и невскрытая), паллета или
 * товар, положенный прямо в ячейку. Такую ячейку пересчитывать как пустую
 * нельзя: найденное в ней — не излишек, а вопрос к старшему.
 */
export function cellTaken(place: CellPlace, cell: CellAddress, exceptBoxId?: string): boolean {
  return (
    place.boxes.some((b) => b.id !== exceptBoxId && sameCell(b.address, cell)) ||
    place.pallets.some((p) => sameCell(p.address, cell)) ||
    Object.values(place.placements).some((a) => sameCell(a, cell))
  );
}

/**
 * Что даст пересчёт пустой ячейки: «пусто» — ничего (`box: null`), найденное
 * — свободная тара в этой ячейке и излишек по каждому товару на неё.
 */
export function planCellCount(
  place: CellPlace,
  known: ReadonlySet<string>,
  input: CellCountInput,
): { problem: CellCountProblem } | { box: Box | null; disputes: Dispute[] } {
  const lines = normalizeCount(input.lines);
  if (!lines) return { problem: "bad" };
  if (cellTaken(place, input.cell, input.boxId)) return { problem: "busy" };
  const { boxes, pallets } = place;
  const found = lines.filter((l) => l.qty > 0);
  if (found.length === 0) return { box: null, disputes: [] };
  if (found.some((l) => !known.has(l.productId))) return { problem: "unknown_product" };
  const tote = boxes.find((b) => b.id === input.boxId);
  if (!tote) return { problem: "no_tote" };
  // Короб на паллете стоит там, где паллета: в ячейку его не поставить.
  const onPallet = !!tote.palletId || pallets.some((p) => p.boxIds.includes(tote.id));
  if (tote.sealed || tote.address || onPallet || tote.lines.some((l) => l.qty > 0)) {
    return { problem: "tote_busy" };
  }
  return {
    box: { ...tote, address: input.cell, countedAt: input.at, countedBy: input.staffId },
    disputes: [...found]
      .sort((a, b) => a.productId.localeCompare(b.productId))
      .map((l) => ({
        id: inventoryDisputeId(input.eventId, l.productId),
        kind: "inventory_over" as const,
        boxId: tote.id,
        toteCode: tote.barcode,
        productId: l.productId,
        qty: l.qty,
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

/**
 * Тара, замороженная до решения старшего: по ней есть открытое расхождение
 * инвентаризации. Из неё не собирают, пока учёт не поправили или не закрыли.
 */
export function frozenBoxes(disputes: readonly Dispute[]): Set<string> {
  return new Set(
    disputes
      .filter((d) => !d.resolution && isInventoryDispute(d) && d.boxId)
      .map((d) => d.boxId as string),
  );
}

/**
 * Что сборщику можно предлагать: без замороженной тары и без карантина
 * (брак и излишек до решения старшего, `heldQty`). Те же правила, по которым
 * сборка снимает штуку (`recordPick`, `deskPick.js`): иначе экран вёл бы
 * к ячейке, из которой взять нельзя.
 */
export function pickableBoxes(boxes: readonly Box[], disputes: readonly Dispute[]): Box[] {
  const frozen = frozenBoxes(disputes);
  return boxes
    .filter((b) => !frozen.has(b.id))
    .map((b) => {
      if (!disputes.some((d) => d.boxId === b.id && !d.resolution)) return b;
      const ids = [...new Set(b.lines.map((l) => l.productId))];
      return {
        ...b,
        lines: ids
          .map((productId) => ({ productId, qty: freeInBox(disputes, b, productId) }))
          .filter((l) => l.qty > 0),
      };
    });
}
