import type { Box, CellAddress, Dispute, Floor } from "./types";
import type { CountLine } from "./inventory";

/**
 * Акт инвентаризации: что насчитали, где, кто и когда, сколько было по учёту
 * и что решил старший.
 *
 * Отдельной таблицы пересчётов нет: числа пересчёта — в журнале операций стола
 * (сервер, `GET /api/cabinet/inventory`, `inventoryLog.js`), расхождение и
 * решение — в спорном снимка. Учёт на момент пересчёта не хранится, но
 * выводится из фактов: сервер заводит спорное ровно на разницу, значит «по
 * учёту» = насчитано + недостача − излишек. Без спорного по товару — сошлось.
 * Ячейка без тары по учёту — учёт ноль, найденное целиком излишек.
 *
 * Чего в данных нет, в акт не пишем (CLAUDE.md, «Деньги и учёт — по фактам»):
 * место тары — текущее, а не на момент пересчёта, и это сказано в листе.
 */

/** Запись журнала пересчётов с сервера. */
export interface InventoryLogEntry {
  kind: "inv_count" | "inv_cell";
  at: number;
  /** Кто считал (`Staff.id`). */
  staff: string;
  eventId: string;
  /** Тара: пересчитанная (`inv_count`) или куда положили найденное (`inv_cell`). */
  boxId?: string;
  /** Ячейка без тары по учёту (`inv_cell`). */
  cell?: CellAddress;
  lines: CountLine[];
}

/** Что стало со строкой: сошлось, ждёт старшего или его решение. */
type ActDecision = "matched" | "pending" | "written_off" | "adopted" | "closed";

export interface InventoryActRow {
  at: number;
  staffId: string;
  /** Где считали: ячейка тары сейчас или пересчитанная ячейка. */
  place: CellAddress | null;
  boxId?: string;
  /** null — ячейка оказалась пуста. */
  productId: string | null;
  book: number;
  fact: number;
  decision: ActDecision;
  /** Причина, которую записал старший. */
  note?: string;
}

const disputeId = (eventId: string, productId: string) =>
  `inv-${eventId}-${productId}`.slice(0, 100);

/** Решение по спорному; спорного нет — строка сошлась. */
function decisionOf(d: Dispute | undefined): ActDecision {
  if (!d) return "matched";
  if (!d.resolution) return "pending";
  if (d.resolution === "written_off") return "written_off";
  if (d.resolution === "accepted") return "adopted";
  return "closed";
}

/** Разница по спорному: на сколько учёт больше насчитанного. */
function bookDelta(d: Dispute | undefined): number {
  if (d?.kind === "inventory_short") return d.qty;
  if (d?.kind === "inventory_over") return -d.qty;
  return 0;
}

/**
 * Строки акта по журналу пересчётов склада. Записи чужого склада (тары и
 * этажа этого склада в них нет) пропускаются: журнал общий на компанию.
 */
export function buildInventoryAct(
  entries: readonly InventoryLogEntry[],
  disputes: readonly Dispute[],
  boxes: readonly Box[],
  floors: readonly Floor[],
): InventoryActRow[] {
  const boxById = new Map(boxes.map((b) => [b.id, b]));
  const floorIds = new Set(floors.map((f) => f.id));
  const disputeById = new Map(disputes.map((d) => [d.id, d]));
  const rows: InventoryActRow[] = [];
  for (const e of [...entries].sort((a, b) => a.at - b.at)) {
    const ours = e.cell ? floorIds.has(e.cell.floorId) : !!e.boxId && boxById.has(e.boxId);
    if (!ours) continue;
    const base = { at: e.at, staffId: e.staff, boxId: e.boxId };
    const counted = new Map(e.lines.filter((l) => l.qty >= 0).map((l) => [l.productId, l.qty]));
    if (e.kind === "inv_cell") {
      const found = [...counted].filter(([, n]) => n > 0);
      if (found.length === 0) {
        rows.push({
          ...base,
          place: e.cell ?? null,
          productId: null,
          book: 0,
          fact: 0,
          decision: "matched",
        });
      }
      for (const [productId, fact] of found.sort(([a], [b]) => a.localeCompare(b))) {
        const d = disputeById.get(disputeId(e.eventId, productId));
        rows.push({
          ...base,
          place: e.cell ?? null,
          productId,
          // Ячейка без тары по учёту: всё найденное — сверх учёта.
          book: 0,
          fact,
          decision: d ? decisionOf(d) : "pending",
          ...(d?.note ? { note: d.note } : {}),
        });
      }
      continue;
    }
    // Товар, которого в таре не нашли вовсе, в строках пересчёта нет — он
    // есть только в спорном (недостача на всё число по учёту).
    const prefix = `inv-${e.eventId}-`;
    for (const d of disputes) {
      if (d.id.startsWith(prefix) && d.productId && !counted.has(d.productId)) {
        counted.set(d.productId, 0);
      }
    }
    const place = (e.boxId && boxById.get(e.boxId)?.address) || null;
    // Пустая тара, и по учёту пустая: строка «пусто, сошлось».
    if (counted.size === 0) {
      rows.push({ ...base, place, productId: null, book: 0, fact: 0, decision: "matched" });
    }
    for (const [productId, fact] of [...counted].sort(([a], [b]) => a.localeCompare(b))) {
      const d = disputeById.get(disputeId(e.eventId, productId));
      rows.push({
        ...base,
        place,
        productId,
        book: fact + bookDelta(d),
        fact,
        decision: decisionOf(d),
        ...(d?.note ? { note: d.note } : {}),
      });
    }
  }
  return rows;
}

/** Сутки строки акта — по часам браузера, как даты в остальных документах. */
export function actDay(at: number): string {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
