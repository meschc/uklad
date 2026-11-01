import { buildReceivingDoc, buildShipmentDoc, docNumber, type DocModel } from "./documents";
import type {
  Box,
  DocEdits,
  DocRecord,
  ExpectedShipment,
  FulfillmentRequest,
  Product,
  ReceivingEvent,
  Shipment,
  StaffMember,
  Warehouse,
} from "./types";

/**
 * Жизнь складского документа: черновик → подтверждён.
 *
 * Документ рождается из операции сам: закрыли поставку — есть лист приёмки
 * (и акт расхождений, если план с фактом не сошёлся), уехал рейс — есть
 * накладная. Записи (`DocRecord`) появляются только когда документ тронули:
 * поправили черновик или подтвердили. Так не нужен хук в каждом срезе, а
 * демо-история сразу приходит со своими документами.
 *
 * Подтверждает только старший (`SENIOR_ROLE`). Подтверждённый документ —
 * снимок: правка карточки товара или заявки его уже не меняет. На сервере
 * старшего определит право `docs.confirm` из роли, а не текст должности.
 */

/** Старший кладовщик, бригадир и выше — по должности из карточки персонала. */
export const SENIOR_ROLE =
  /старш|бригадир|начальник|управля|заместител|руковод|директор|senior|lead|manager/i;

export const isSenior = (m: Pick<StaffMember, "role"> | undefined): boolean =>
  !!m && SENIOR_ROLE.test(m.role);

export type DocSourceKind = DocRecord["kind"];

export interface DocSources {
  warehouse: Warehouse;
  products: Product[];
  requests: FulfillmentRequest[];
  shipments: Shipment[];
  expectedShipments: ExpectedShipment[];
  receivingEvents: ReceivingEvent[];
  boxes: Box[];
}

/** Источники документов из состояния склада — стор подходит целиком. */
export const pickDocSources = (s: DocSources): DocSources => ({
  warehouse: s.warehouse,
  products: s.products,
  requests: s.requests,
  shipments: s.shipments,
  expectedShipments: s.expectedShipments,
  receivingEvents: s.receivingEvents,
  boxes: s.boxes,
});

/** Строка списка документов: из какой операции и в каком он статусе. */
export interface DocEntry {
  kind: DocSourceKind;
  sourceId: string;
  title: string;
  date: number;
  record?: DocRecord;
  status: DocRecord["status"];
}

/**
 * Документы, которые уже есть: по каждой закрытой поставке и каждому рейсу.
 * Открытая поставка документа ещё не дала — по ней печатают рабочий лист, но
 * подтверждать там нечего.
 */
export function docEntries(src: DocSources, records: DocRecord[]): DocEntry[] {
  const recordOf = (kind: DocSourceKind, id: string) =>
    records.find((r) => r.kind === kind && r.sourceId === id);
  const out: DocEntry[] = [];
  for (const s of src.expectedShipments) {
    if (s.status !== "closed") continue;
    const record = recordOf("receiving", s.id);
    out.push({
      kind: "receiving",
      sourceId: s.id,
      title: s.title ?? "",
      date: s.closedAt ?? s.createdAt,
      record,
      status: record?.status ?? "draft",
    });
  }
  for (const s of src.shipments) {
    const record = recordOf("shipment", s.id);
    out.push({
      kind: "shipment",
      sourceId: s.id,
      title: s.destination,
      date: s.shippedAt,
      record,
      status: record?.status ?? "draft",
    });
  }
  return out.sort((a, b) => b.date - a.date);
}

/** Модель из операции, ещё без правок. null — операции уже нет. */
export function baseDoc(kind: DocSourceKind, sourceId: string, src: DocSources): DocModel | null {
  if (kind === "shipment") {
    const ship = src.shipments.find((s) => s.id === sourceId);
    return ship ? buildShipmentDoc(ship, src.requests, src.products) : null;
  }
  const exp = src.expectedShipments.find((s) => s.id === sourceId);
  if (!exp) return null;
  const doc = buildReceivingDoc(exp, src.receivingEvents, src.products, src.warehouse, src.boxes);
  // Поставка закрыта — непринятое уже не «ещё не считали», а ноль: иначе
  // недостача по строке, которую так и не нашли, не попадёт в акт.
  if (exp.status === "closed") {
    const lines = doc.lines.map((l) => ({ ...l, fact: l.fact ?? 0 }));
    return { ...doc, lines, totalFact: lines.reduce((s, l) => s + (l.fact ?? 0), 0) };
  }
  return doc;
}

/** Черновик с правками поверх модели из операции. */
export function applyEdits(doc: DocModel, edits: DocEdits): DocModel {
  const lines = doc.lines.map((l) => {
    const fact = edits.facts?.[String(l.no)];
    return fact != null ? { ...l, fact } : l;
  });
  const anyFact = lines.some((l) => l.fact != null);
  return {
    ...doc,
    vehicle: edits.vehicle ?? doc.vehicle,
    responsible: edits.responsible ?? doc.responsible,
    seals: edits.seals ?? doc.seals,
    comment: edits.comment ?? doc.comment,
    lines,
    totalFact: anyFact ? lines.reduce((s, l) => s + (l.fact ?? 0), 0) : undefined,
  };
}

/**
 * Документ как его видят и печатают: подтверждённый — снимок, черновик —
 * операция плюс правки.
 */
export function resolveDoc(
  kind: DocSourceKind,
  sourceId: string,
  src: DocSources,
  record?: DocRecord,
): DocModel | null {
  if (record?.status === "confirmed" && record.snapshot) return record.snapshot;
  const base = baseDoc(kind, sourceId, src);
  return base && record ? applyEdits(base, record.edits) : base;
}

/**
 * Акт расхождений из листа приёмки: только строки, где факт не сошёлся с
 * планом. null — расхождений нет, акт не нужен.
 */
export function discrepancyDoc(receiving: DocModel, sourceId: string): DocModel | null {
  const lines = receiving.lines
    .filter((l) => l.fact != null && l.fact !== l.qty)
    .map((l, i) => ({ ...l, no: i + 1 }));
  if (lines.length === 0) return null;
  return {
    ...receiving,
    kind: "discrepancy",
    number: docNumber("discrepancy", sourceId, receiving.date),
    lines,
    totalQty: lines.reduce((s, l) => s + l.qty, 0),
    totalFact: lines.reduce((s, l) => s + (l.fact ?? 0), 0),
  };
}
