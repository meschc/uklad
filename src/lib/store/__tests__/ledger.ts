import { adoptsGoods, writesOffGoods } from "../../disputes";
import type { EditorState } from "../state";

/**
 * Книга остатков для сквозных проверок: товар не появляется из ничего, не
 * исчезает без следа и не числится в двух местах сразу.
 *
 * По каждому товару считаем три суммы:
 *   · пришло — события приёмки плюс то, что лежало на складе в начале и
 *     излишек инвентаризации, оприходованный старшим (товар найден, не принят);
 *   · на складе — тара и короба приёмки, открытые короба отгрузки и
 *     снятое в заявку без тары, пока заявка не уехала;
 *   · ушло — уехавшие короба отгрузки, уехавшее снятое в заявку и
 *     списанное старшим (недостача и брак).
 * Закон один: пришло = на складе + ушло. Любой шаг склада, который его
 * нарушает, либо потерял товар, либо задвоил.
 */

type Stock = Pick<
  EditorState,
  "boxes" | "outboundBoxes" | "requests" | "receivingEvents" | "disputes" | "placements"
>;

interface Balance {
  in: number;
  stock: number;
  gone: number;
}

const add = (m: Map<string, Balance>, p: string, k: keyof Balance, n: number) => {
  const b = m.get(p) ?? { in: 0, stock: 0, gone: 0 };
  b[k] += n;
  m.set(p, b);
};

/** Где сейчас товар: только «на складе», без прихода. */
export function onHand(s: Stock): Map<string, number> {
  const m = new Map<string, Balance>();
  place(s, m);
  return new Map([...m].map(([p, b]) => [p, b.stock]));
}

function place(s: Stock, m: Map<string, Balance>) {
  for (const b of s.boxes) for (const l of b.lines) add(m, l.productId, "stock", l.qty);
  for (const b of s.outboundBoxes ?? [])
    for (const l of b.lines) add(m, l.productId, b.shipmentId ? "gone" : "stock", l.qty);
  for (const r of s.requests) {
    // Собранное в тару лежит в таре (и потом в коробе отгрузки) — второй
    // раз его не считаем.
    if (r.toteId || !r.pickedQty) continue;
    add(m, r.productId, r.status === "shipped" ? "gone" : "stock", r.pickedQty);
  }
  for (const p of Object.keys(s.placements ?? {})) add(m, p, "stock", 1);
  for (const d of s.disputes ?? []) {
    if (d.resolution === "written_off" && writesOffGoods(d) && d.productId) {
      add(m, d.productId, "gone", d.qty);
    }
    if (d.resolution === "accepted" && adoptsGoods(d) && d.productId) {
      add(m, d.productId, "in", d.qty);
    }
  }
}

/** Книга по всем товарам; `opening` — что лежало до начала сценария. */
function ledger(s: Stock, opening: ReadonlyMap<string, number> = new Map()) {
  const m = new Map<string, Balance>();
  for (const [p, n] of opening) add(m, p, "in", n);
  for (const e of s.receivingEvents) add(m, e.productId, "in", e.qty);
  place(s, m);
  return m;
}

/** Товары, по которым закон не сходится: пустой список — всё на месте. */
export function broken(s: Stock, opening?: ReadonlyMap<string, number>) {
  return [...ledger(s, opening)]
    .filter(([, b]) => b.in !== b.stock + b.gone)
    .map(([p, b]) => `${p}: пришло ${b.in}, на складе ${b.stock}, ушло ${b.gone}`);
}
