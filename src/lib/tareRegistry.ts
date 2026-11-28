/**
 * Реестр выпущенной тары и паллет (разбор экранов 27.11: «реестр выпущенной
 * тары — на вкладке „Товары“»). Чистое правило: из коробок и паллет склада —
 * строки реестра с состоянием, составом и местом. О хранилище не знает.
 *
 * Номер выдаётся, когда его печатают на «Наклейках», и с этой минуты тара
 * существует, даже если печать оборвалась. Поэтому в реестре есть всё, что
 * выдано, — в том числе ненапечатанное: его видно и можно допечатать.
 */
import type { Box, Pallet } from "./types";
import { labelNumber } from "./barcode";

type TareKind = "box" | "pallet";

/**
 * Состояние тары:
 * - `unprinted` — номер выдан, ярлык не печатали, тара пустая и нигде не стоит;
 * - `empty` — напечатана, пустая;
 * - `filled` — с товаром (паллета — с коробками);
 * - `onPallet` — коробка с товаром стоит на паллете;
 * - `sealed` — принята местом на грузовой приёмке и ещё не вскрыта.
 */
export type TareState = "unprinted" | "empty" | "filled" | "onPallet" | "sealed";

export interface TareRow {
  id: string;
  kind: TareKind;
  code: string;
  /** Номер из ярлыка для сортировки (UK-BOX-12 → 12). */
  n: number | null;
  state: TareState;
  /** Позиций (разных товаров) и штук. У паллеты — по всем её коробкам. */
  positions: number;
  units: number;
  /** Коробок на паллете; у коробки — 0. */
  boxCount: number;
  /** Товары внутри (видимые пользователю), больше штук — раньше. */
  productIds: string[];
  /** Паллета, на которой стоит коробка. */
  palletId?: string;
  address?: Box["address"];
  createdAt: number;
  printedAt?: number;
  printCount: number;
}

/** Товары по убыванию штук: в строке реестра первым виден главный. */
function byQty(lines: Box["lines"]): string[] {
  const sum = new Map<string, number>();
  for (const l of lines) sum.set(l.productId, (sum.get(l.productId) ?? 0) + l.qty);
  return [...sum].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

function boxState(b: Box, lines: Box["lines"]): TareState {
  if (b.sealed) return "sealed";
  if (lines.length > 0) return b.palletId ? "onPallet" : "filled";
  if (!b.printedAt && !b.address && !b.palletId) return "unprinted";
  return "empty";
}

/**
 * Строки реестра. `visible` — товары, которые видит пользователь: продавцу
 * склад показывает только тару со своим товаром и в ней — только свои строки.
 * Не передан — видно всё (склад).
 */
export function buildTareRows(
  boxes: Box[],
  pallets: Pallet[],
  visible?: ReadonlySet<string>,
): TareRow[] {
  const own = (lines: Box["lines"]) =>
    visible ? lines.filter((l) => visible.has(l.productId)) : lines;
  const boxById = new Map(boxes.map((b) => [b.id, b]));
  const rows: TareRow[] = [];

  for (const b of boxes) {
    const lines = own(b.lines);
    // Продавцу чужая и пустая тара ни к чему: в ней нет его товара.
    if (visible && lines.length === 0) continue;
    rows.push({
      id: b.id,
      kind: "box",
      code: b.barcode,
      n: labelNumber(b.barcode),
      state: boxState(b, lines),
      positions: new Set(lines.map((l) => l.productId)).size,
      units: lines.reduce((s, l) => s + l.qty, 0),
      boxCount: 0,
      productIds: byQty(lines),
      palletId: b.palletId,
      address: b.address,
      createdAt: b.createdAt,
      printedAt: b.printedAt,
      printCount: b.printCount ?? 0,
    });
  }

  for (const p of pallets) {
    const inside = p.boxIds.map((id) => boxById.get(id)).filter((b): b is Box => !!b);
    const mine = visible ? inside.filter((b) => own(b.lines).length > 0) : inside;
    const lines = mine.flatMap((b) => own(b.lines));
    if (visible && lines.length === 0) continue;
    const state: TareState = p.sealed
      ? "sealed"
      : inside.length > 0
        ? "filled"
        : !p.printedAt && !p.address
          ? "unprinted"
          : "empty";
    rows.push({
      id: p.id,
      kind: "pallet",
      code: p.barcode,
      n: labelNumber(p.barcode),
      state,
      positions: new Set(lines.map((l) => l.productId)).size,
      units: lines.reduce((s, l) => s + l.qty, 0),
      boxCount: mine.length,
      productIds: byQty(lines),
      address: p.address,
      createdAt: p.createdAt,
      printedAt: p.printedAt,
      printCount: p.printCount ?? 0,
    });
  }
  return rows;
}

/** Состав тары: товар и штуки, у паллеты — сложено по её коробкам. */
export function tareContents(
  row: Pick<TareRow, "id" | "kind">,
  boxes: Box[],
  pallets: Pallet[],
  visible?: ReadonlySet<string>,
): { productId: string; qty: number }[] {
  const ids =
    row.kind === "box"
      ? new Set([row.id])
      : new Set(pallets.find((p) => p.id === row.id)?.boxIds ?? []);
  const sum = new Map<string, number>();
  for (const b of boxes) {
    if (!ids.has(b.id)) continue;
    for (const l of b.lines)
      if (!visible || visible.has(l.productId))
        sum.set(l.productId, (sum.get(l.productId) ?? 0) + l.qty);
  }
  return [...sum].map(([productId, qty]) => ({ productId, qty }));
}
