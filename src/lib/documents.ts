import { formatAddress } from "./address";
import { stockByProduct } from "./fulfillment";
import type {
  Box,
  CellAddress,
  ExpectedShipment,
  FulfillmentRequest,
  Product,
  ReceivingEvent,
  Shipment,
  Warehouse,
} from "./types";

/**
 * Складские документы (п.12): лист сборки, накладная на отгрузку, лист приёмки.
 *
 * Здесь только сборка модели документа из данных склада — ни вёрстки, ни
 * подписей: их знает печатная форма. Разделение не косметическое: номер
 * документа и состав строк должны считаться одинаково и в предпросмотре, и на
 * бумаге, и завтра — в выгрузке для бухгалтерии.
 *
 * Формы намеренно НЕ выдают себя за унифицированные ТОРГ-12 и М-4: у нас нет
 * ни цен, ни НДС, ни реквизитов сторон, а бланк с пустыми обязательными графами
 * бухгалтерия всё равно не примет. Это внутренние рабочие листы склада —
 * по составу граф близкие к М-4 (приход) и к расходной накладной (отгрузка).
 */

export type DocKind = "pick" | "shipment" | "receiving";

/** Одна строка документа. */
export interface DocLine {
  no: number;
  sku: string;
  name: string;
  /** Плановое количество: заказано / ожидалось. */
  qty: number;
  /** Фактическое количество, если у документа есть графа «факт». */
  fact?: number;
  /** Откуда брать / куда положили. */
  address?: string;
  note?: string;
}

export interface DocModel {
  kind: DocKind;
  /** Номер документа — детерминированный, чтобы перепечатка не плодила номера. */
  number: string;
  date: number;
  /** Контрагент или назначение свободной строкой. */
  counterparty?: string;
  /** Машина / водитель. */
  vehicle?: string;
  lines: DocLine[];
  totalQty: number;
  totalFact?: number;
}

const PREFIX: Record<DocKind, string> = {
  pick: "СБ",
  shipment: "РН",
  receiving: "ПР",
};

/**
 * Номер документа: «РН-260820-3F7A». Дата — чтобы номер читался глазом, хвост —
 * стабильный хеш источника: тот же рейс всегда печатается тем же номером,
 * разные — разными. Сквозной счётчик здесь был бы враньём: он должен жить в
 * учётной системе, а не в браузере одного кладовщика.
 */
export function docNumber(kind: DocKind, sourceId: string, date: number): string {
  const d = new Date(date);
  const ymd =
    String(d.getFullYear() % 100).padStart(2, "0") +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0");
  let hash = 0;
  for (let i = 0; i < sourceId.length; i++) {
    hash = (hash * 31 + sourceId.charCodeAt(i)) >>> 0;
  }
  return `${PREFIX[kind]}-${ymd}-${hash.toString(16).toUpperCase().padStart(4, "0").slice(-4)}`;
}

const nameOf = (products: Product[], id: string) =>
  products.find((p) => p.id === id)?.name ?? "—";
const skuOf = (products: Product[], id: string) =>
  products.find((p) => p.id === id)?.sku ?? "—";

const addrText = (warehouse: Warehouse, addr?: CellAddress) =>
  addr ? (formatAddress(warehouse, addr) ?? undefined) : undefined;

/**
 * Лист сборки: что снять с полок по пачке заявок. Адрес в строке — тот, где
 * товар лежит СЕЙЧАС, а не куда его положат: сборщик идёт по этому листу
 * ногами, и адрес назначения ему в пути только мешает.
 */
export function buildPickDoc(
  requests: FulfillmentRequest[],
  products: Product[],
  warehouse: Warehouse,
  placements: Record<string, CellAddress>,
  boxes: Box[],
  sourceId: string,
  now = Date.now(),
): DocModel {
  const stock = stockByProduct(placements, boxes);
  const lines: DocLine[] = requests.map((r, i) => ({
    no: i + 1,
    sku: skuOf(products, r.productId),
    name: nameOf(products, r.productId),
    qty: r.qty,
    fact: r.pickedQty,
    address: stock
      .get(r.productId)
      ?.locations.map((l) => formatAddress(warehouse, l.addr))
      .filter(Boolean)
      .join(", "),
    note: r.vehicle,
  }));

  return {
    kind: "pick",
    number: docNumber("pick", sourceId, now),
    date: now,
    counterparty: requests.find((r) => r.note)?.note,
    vehicle: requests.find((r) => r.vehicle)?.vehicle,
    lines,
    totalQty: lines.reduce((s, l) => s + l.qty, 0),
    totalFact: lines.reduce((s, l) => s + (l.fact ?? 0), 0),
  };
}

/**
 * Накладная на отгрузку по рейсу: что уехало одной машиной. В графе количества
 * — собранное, а не заказанное: подписывают то, что физически погрузили.
 */
export function buildShipmentDoc(
  shipment: Shipment,
  requests: FulfillmentRequest[],
  products: Product[],
): DocModel {
  const items = requests.filter((r) => shipment.requestIds.includes(r.id));
  const lines: DocLine[] = items.map((r, i) => ({
    no: i + 1,
    sku: skuOf(products, r.productId),
    name: nameOf(products, r.productId),
    qty: r.qty,
    fact: r.pickedQty ?? r.qty,
    note: r.partial ? "частично" : undefined,
  }));

  return {
    kind: "shipment",
    number: docNumber("shipment", shipment.id, shipment.shippedAt),
    date: shipment.shippedAt,
    counterparty: shipment.destination,
    vehicle: shipment.vehicle,
    lines,
    totalQty: lines.reduce((s, l) => s + l.qty, 0),
    totalFact: lines.reduce((s, l) => s + (l.fact ?? 0), 0),
  };
}

/**
 * Лист приёмки по ожидаемой поставке: ожидалось / принято / расхождение.
 * Строки берём из самой поставки, а не из событий приёмки: непринятая позиция
 * должна остаться в листе с нулём в графе «принято» — именно она и есть
 * недостача, ради которой лист подписывают.
 */
export function buildReceivingDoc(
  shipment: ExpectedShipment,
  events: ReceivingEvent[],
  products: Product[],
  warehouse: Warehouse,
  boxes: Box[],
): DocModel {
  const boxAddr = new Map(boxes.map((b) => [b.id, b.address]));
  const lines: DocLine[] = shipment.lines.map((l, i) => {
    const own = events.filter((e) => e.expectedShipmentLineId === l.id);
    const address = [
      ...new Set(
        own
          .map((e) => addrText(warehouse, boxAddr.get(e.boxId) ?? undefined))
          .filter((a): a is string => !!a),
      ),
    ].join(", ");
    return {
      no: i + 1,
      sku: skuOf(products, l.productId),
      name: nameOf(products, l.productId),
      qty: l.expectedQty,
      // Ноль и «ещё не принимали» — разные вещи. Непринятая строка уходит на
      // бумагу пустой клеткой: её заполнят ручкой на рампе, а «0» в этом месте
      // читался бы как зафиксированная недостача на всю партию.
      fact: l.receivedQty || undefined,
      address: address || undefined,
    };
  });

  const anyFact = lines.some((l) => l.fact != null);
  const date = shipment.closedAt ?? shipment.createdAt;
  return {
    kind: "receiving",
    number: docNumber("receiving", shipment.id, date),
    date,
    counterparty: shipment.title,
    lines,
    totalQty: lines.reduce((s, l) => s + l.qty, 0),
    totalFact: anyFact
      ? lines.reduce((s, l) => s + (l.fact ?? 0), 0)
      : undefined,
  };
}
