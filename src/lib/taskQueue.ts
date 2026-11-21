import type {
  Box,
  Dispute,
  ExpectedShipment,
  FulfillmentRequest,
  OutboundBox,
  WarehouseTask,
} from "./types";
import { groupRequestsByTarget } from "./fulfillment";
import { staleBoxes } from "./inventory";
import { unsorted } from "./sorting";

/**
 * Очередь склада по всем процессам (Кирилл 13.11: «процессы у нас почти все,
 * а задания только на сборку»).
 *
 * Задание здесь — не своя запись, а то, что уже лежит в данных и ждёт
 * человека: поставка ждёт приёмки, заявка — сборки, тара — упаковки, посылка —
 * сортировки, заказ — машины. Заводить на это отдельные записи значило бы
 * вести второй учёт той же работы, и он разошёлся бы с первым при первом же
 * скане. Своя запись есть только у работ, которых система сама не видит
 * (`tasks`), и у решений старшего (`disputes`).
 *
 * Модуль чистый: о сторе и сервере не знает, получает списки и «сейчас».
 * Закрытый правами раздел приходит с сервера пустым списком — его группы
 * просто нет.
 */

/** Процессы в порядке пути товара: от рампы до машины, потом работы и решения. */
const QUEUE_PROCESSES = [
  "receiving",
  "picking",
  "packing",
  "sorting",
  "shipping",
  "inventory",
  "work",
  "approvals",
] as const;
export type QueueProcess = (typeof QUEUE_PROCESSES)[number];

export interface QueueItem {
  key: string;
  /**
   * Что делать — из данных: название поставки, назначение, код тары, вид
   * работы или спорного. `null` — в данных пусто, подпись даёт экран.
   */
  label: string | null;
  /** Сколько: штук, посылок, заявок — единица у процесса своя. */
  units: number;
  /** С какого момента ждёт. */
  since: number;
  /** Уже начато: приёмка идёт, заявку собирают, работу взяли. */
  active: boolean;
  /** Срок: ближайшая дата машины (отгрузки) сборки. Есть — идёт раньше прочих. */
  due?: number;
  /** Кто взял — только там, где это записано. */
  staffId?: string;
}

export interface QueueGroup {
  process: QueueProcess;
  items: QueueItem[];
}

export interface QueueInput {
  expectedShipments: readonly ExpectedShipment[];
  requests: readonly FulfillmentRequest[];
  boxes: readonly Box[];
  outboundBoxes: readonly OutboundBox[];
  tasks: readonly WarehouseTask[];
  disputes: readonly Dispute[];
  /** Кто сейчас принимает и какую поставку (`receiving` стора). */
  receiving?: { shipmentId: string | null; staffId: string };
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const earliest = (xs: readonly number[]) => (xs.length ? Math.min(...xs) : 0);
/** Сколько штук заявки лежит в таре: частично собранная — сколько собрали. */
const pickedUnits = (r: FulfillmentRequest) => (r.partial ? (r.pickedQty ?? 0) : r.qty);

function receivingItems(input: QueueInput): QueueItem[] {
  return input.expectedShipments
    .filter((s) => s.status !== "closed")
    .map((s) => ({
      key: s.id,
      label: s.title?.trim() || null,
      units: sum(s.lines.map((l) => Math.max(0, l.expectedQty - l.receivedQty))),
      since: s.createdAt,
      active: s.status === "receiving",
      staffId:
        input.receiving?.shipmentId === s.id && input.receiving.staffId
          ? input.receiving.staffId
          : undefined,
    }));
}

/** Сборка — по назначению, как её и везут: одна машина на получателя. */
function pickingItems(requests: readonly FulfillmentRequest[]): QueueItem[] {
  const open = requests.filter((r) => r.status === "new" || r.status === "in_progress");
  return groupRequestsByTarget(open).map((g) => ({
    key: `pick:${g.target ?? ""}`,
    label: g.target,
    units: sum(g.items.map((r) => r.qty)),
    since: earliest(g.items.map((r) => r.createdAt)),
    active: g.items.some((r) => r.status === "in_progress"),
    ...(g.shipDate != null ? { due: g.shipDate } : {}),
  }));
}

/** Упаковка — по таре сборки: упаковщик берёт тару целиком. */
function packingItems(input: QueueInput): QueueItem[] {
  const waiting = input.requests.filter((r) => r.status === "done" && !r.packedAt);
  const byTote = new Map<string, FulfillmentRequest[]>();
  for (const r of waiting) {
    const k = r.toteId ?? "";
    byTote.set(k, [...(byTote.get(k) ?? []), r]);
  }
  return [...byTote].map(([toteId, items]) => ({
    key: `pack:${toteId}`,
    label: input.boxes.find((b) => b.id === toteId)?.barcode ?? null,
    units: sum(items.map(pickedUnits)),
    since: earliest(items.map((r) => r.pickedAt ?? r.updatedAt)),
    active: false,
  }));
}

/** Сортировка — по направлению: посылки одного направления едут на одно место. */
function sortingItems(input: QueueInput): QueueItem[] {
  const byDest = new Map<string, OutboundBox[]>();
  for (const { box, destination } of unsorted(input.outboundBoxes, input.requests)) {
    byDest.set(destination, [...(byDest.get(destination) ?? []), box]);
  }
  return [...byDest].map(([destination, parcels]) => ({
    key: `sort:${destination}`,
    label: destination,
    units: parcels.length,
    since: earliest(parcels.map((b) => b.createdAt)),
    active: false,
  }));
}

/**
 * Отгрузка — упакованные заказы, которые ждут машину. Посылка, ещё не
 * разложенная по месту сортировки, ждёт сортировку, а не машину: дважды в
 * очереди одна работа не стоит.
 */
function shippingItems(input: QueueInput): QueueItem[] {
  const onSorting = new Set(
    unsorted(input.outboundBoxes, input.requests).flatMap((x) => x.box.requestIds),
  );
  const ready = input.requests.filter(
    (r) => r.status === "done" && r.packedAt && !onSorting.has(r.id),
  );
  return groupRequestsByTarget(ready).map((g) => ({
    key: `ship:${g.target ?? ""}`,
    label: g.target,
    units: g.items.length,
    since: earliest(g.items.map((r) => r.packedAt ?? r.updatedAt)),
    active: false,
  }));
}

/** Пересчёт — тара на полках, которую давно не считали. */
function inventoryItems(boxes: readonly Box[], now: number): QueueItem[] {
  return staleBoxes(boxes, now).map((b) => ({
    key: b.id,
    label: b.barcode,
    units: sum(b.lines.map((l) => l.qty)),
    since: b.countedAt ?? b.createdAt,
    active: false,
  }));
}

function workItems(tasks: readonly WarehouseTask[]): QueueItem[] {
  return tasks
    .filter((x) => x.status === "open" || x.status === "in_progress")
    .map((x) => ({
      key: x.id,
      label: x.kind,
      units: x.qty,
      since: x.createdAt,
      active: x.status === "in_progress",
      staffId: x.staffId,
    }));
}

function approvalItems(disputes: readonly Dispute[]): QueueItem[] {
  return disputes
    .filter((d) => !d.resolvedAt)
    .map((d) => ({
      key: d.id,
      label: d.kind,
      units: d.qty,
      since: d.raisedAt,
      active: !!d.writeOffRequest,
    }));
}

/** Сначала то, у чего ближе срок; без срока — что ждёт дольше. */
const byUrgency = (a: QueueItem, b: QueueItem) =>
  (a.due ?? Infinity) - (b.due ?? Infinity) || a.since - b.since;

/** Вся очередь склада: процессы с работой, внутри — сначала срочное, потом то, что ждёт дольше. */
export function taskQueue(input: QueueInput, now: number): QueueGroup[] {
  const by: Record<QueueProcess, QueueItem[]> = {
    receiving: receivingItems(input),
    picking: pickingItems(input.requests),
    packing: packingItems(input),
    sorting: sortingItems(input),
    shipping: shippingItems(input),
    inventory: inventoryItems(input.boxes, now),
    work: workItems(input.tasks),
    approvals: approvalItems(input.disputes),
  };
  return QUEUE_PROCESSES.map((process) => ({
    process,
    items: [...by[process]].sort(byUrgency),
  })).filter((g) => g.items.length > 0);
}
