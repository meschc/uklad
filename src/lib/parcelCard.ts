import { findByCode, normalizeCode as norm } from "./barcode";
import type { MsgKey } from "./i18n";
import type { Box, FulfillmentRequest, OrderSource, OutboundBox, Partner, Product } from "./types";

/**
 * Найденная посылка (Кирилл 23.11): старший сканирует упакованную посылку,
 * которая лежала не на месте, и видит, что это за заказ и что с ним делать.
 * Посылку узнаём по нашему ярлыку (`UK-ORD-…`, `UK-LBL-…`, `UK-OUT-…`) и по
 * номеру заказа площадки на её этикетке (`externalId` заявки).
 *
 * Чистое правило: на входе данные склада, на выходе карточка. Экран рисует.
 */

/** Что с посылкой сейчас. */
type ParcelState =
  /** Заказ отменили после упаковки: вскрыть, товар вернуть на остаток. */
  | "cancelled"
  /** Живой заказ, посылка ещё на складе: вернуть в отгрузку. */
  | "waiting"
  /** Уже уехала: на складе её быть не должно. */
  | "shipped";

export interface ParcelCard {
  box: OutboundBox;
  state: ParcelState;
  /** Номера заказов площадки (или наши id, если номера нет). */
  orders: string[];
  sources: OrderSource[];
  sellers: string[];
  lines: { product: Product | null; productId: string; qty: number }[];
  /** Где посылка должна быть: место сортировки; пусто — ещё не сортировали. */
  sortCode: string | null;
}

interface ParcelData {
  outboundBoxes: readonly OutboundBox[];
  requests: readonly FulfillmentRequest[];
  products: readonly Product[];
  partners: readonly Partner[];
}

/** Посылка по коду или номеру заказа; `null` — это не посылка. */
export function parcelCard(raw: string, data: ParcelData): ParcelCard | null {
  const code = norm(raw);
  if (!code) return null;
  const parcels = data.outboundBoxes.filter((b) => !b.place);
  let box = parcels.find((b) => norm(b.code) === code);
  if (!box) {
    const ids = new Set(
      data.requests.filter((r) => r.externalId && norm(r.externalId) === code).map((r) => r.id),
    );
    // Сначала та, что ещё на складе: у одного заказа может быть уехавшая часть.
    const hits = parcels.filter((b) => b.requestIds.some((id) => ids.has(id)));
    box = hits.find((b) => !b.shipmentId) ?? hits[0];
  }
  if (!box) return null;
  const own = new Set(box.requestIds);
  const reqs = data.requests.filter((r) => own.has(r.id));
  const state: ParcelState = box.shipmentId
    ? "shipped"
    : reqs.some((r) => r.status === "cancelled")
      ? "cancelled"
      : "waiting";
  const productOf = (id: string) => data.products.find((p) => p.id === id) ?? null;
  const sellers = new Set<string>();
  for (const l of box.lines) {
    const pid = productOf(l.productId)?.partnerId;
    const name = pid ? data.partners.find((p) => p.id === pid)?.name : undefined;
    if (name) sellers.add(name);
  }
  return {
    box,
    state,
    orders: [...new Set(reqs.map((r) => r.externalId?.trim() || r.id))],
    sources: [...new Set(reqs.map((r) => r.source).filter((s): s is OrderSource => !!s))],
    sellers: [...sellers],
    lines: box.lines.map((l) => ({
      product: productOf(l.productId),
      productId: l.productId,
      qty: l.qty,
    })),
    sortCode: box.sortCode ?? null,
  };
}

/**
 * Вскрыть отменённую посылку в тару (решение Кирилла 23.11: в кабинете, «Что
 * это?»). Товар посылки уходит в пустую тару, посылка исчезает из отгрузки,
 * тару дальше размещают как обычно. Отказ — ключ словаря, иначе тара.
 */
export function openParcelCheck(
  card: ParcelCard | null,
  boxes: readonly Box[],
  toteCode: string,
): { ok: true; tote: Box } | { ok: false; error: MsgKey } {
  if (!card || card.state !== "cancelled") return { ok: false, error: "parcel.open.notCancelled" };
  const tote = findByCode(boxes as Box[], toteCode);
  if (!tote || tote.address || tote.sealed) return { ok: false, error: "parcel.open.badTote" };
  if (tote.lines.some((l) => l.qty > 0)) return { ok: false, error: "parcel.open.toteBusy" };
  return { ok: true, tote };
}
