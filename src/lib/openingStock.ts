import { addressKey } from "./address";
import { generateBoxBarcode } from "./barcode";
import { nowMs, uid } from "./utils";
import type { Box, CellAddress, Product, ReceivingEvent } from "./types";

/**
 * Ввод начальных остатков (Кирилл 28.11, п. 2.2 списка до запуска): товар
 * лежал на складе до Уклада, и первый день склада — перенести его, а не
 * принимать заново.
 *
 * Остаток живёт там же, где весь товар, — в таре (`Box.lines`). На каждую
 * ячейку файла — одна новая тара с адресом; строки без ячейки — каждая в
 * свою тару без адреса, она ждёт размещения, как после приёмки. На каждую
 * строку — событие с `opening: true`: книга остатков (`ledger.ts`) видит его
 * как «пришло», а счёт продавцу, выработка и акт приёмки — нет
 * (`liveReceipts`). Автора у события нет: товар никто не принимал, а кто
 * вводил, сервер пишет в журнал движений сам (`moves.js`).
 */

export interface OpeningInput {
  sku: string;
  qty: number;
  cell?: CellAddress;
}

export function openingStock(
  products: readonly Pick<Product, "id" | "sku">[],
  lines: readonly OpeningInput[],
  boxSeq: number,
  at = nowMs(),
): { boxes: Box[]; events: ReceivingEvent[]; boxSeq: number } {
  const bySku = new Map(products.map((p) => [p.sku, p.id]));
  const boxes: Box[] = [];
  const events: ReceivingEvent[] = [];
  const atCell = new Map<string, Box>();
  let seq = boxSeq;
  const newBox = (address?: CellAddress): Box => {
    seq += 1;
    const box: Box = {
      id: uid("box"),
      barcode: generateBoxBarcode(seq),
      createdAt: at,
      lines: [],
      ...(address ? { address } : {}),
    };
    boxes.push(box);
    return box;
  };

  for (const l of lines) {
    const productId = bySku.get(l.sku);
    // Не целое и не положительное сюда не доходит (разбор файла), но правило
    // «товар не появляется из ничего» стоит и здесь.
    if (!productId || !Number.isInteger(l.qty) || l.qty <= 0) continue;
    let box: Box;
    if (l.cell) {
      const key = addressKey(l.cell);
      box = atCell.get(key) ?? newBox(l.cell);
      atCell.set(key, box);
    } else box = newBox();
    const same = box.lines.find((x) => x.productId === productId);
    if (same) same.qty += l.qty;
    else box.lines.push({ productId, qty: l.qty });
    events.push({
      id: uid("recv"),
      productId,
      qty: l.qty,
      boxId: box.id,
      timestamp: at,
      opening: true,
    });
  }
  return { boxes, events, boxSeq: seq };
}

/**
 * Сколько товара уже в таре — на полке или ждёт размещения. Есть остаток —
 * второй ввод того же файла его не удвоит (`import.row.hasStock`).
 */
export function onHandByProduct(boxes: readonly Pick<Box, "lines">[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const b of boxes) {
    for (const l of b.lines) out.set(l.productId, (out.get(l.productId) ?? 0) + l.qty);
  }
  return out;
}
