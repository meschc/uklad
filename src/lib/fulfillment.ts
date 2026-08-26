import { addressKey } from "./address";
import { allCells } from "./placement";
import type {
  Shipment,
  Box,
  CellAddress,
  ExpectedShipment,
  ExpectedShipmentLine,
  FulfillmentRequest,
  ReceivingEvent,
  Warehouse,
} from "./types";

/**
 * Чистые расчёты по фулфилменту: где и сколько лежит товара, что показывать
 * на дашборде. Никакого React и стора — только данные на входе и выходе,
 * чтобы одни и те же числа считались одинаково на всех экранах.
 */

/** Одно физическое место товара: адрес + сколько там единиц. */
export interface StockLocation {
  addr: CellAddress;
  qty: number;
  /** Заполнено, если товар лежит в коробке, а не размещён напрямую. */
  boxId?: string;
  boxBarcode?: string;
}

export interface Stock {
  qty: number;
  locations: StockLocation[];
}

/**
 * Остатки по товарам из ОБОИХ путей хранения: прямое размещение из таблицы
 * (одна единица) и коробки приёмки с количествами. Это же используется на
 * экране сборки, чтобы подсказать, куда идти.
 */
export function stockByProduct(
  placements: Record<string, CellAddress>,
  boxes: Box[],
): Map<string, Stock> {
  const out = new Map<string, Stock>();
  const push = (productId: string, loc: StockLocation) => {
    const cur = out.get(productId) ?? { qty: 0, locations: [] };
    cur.qty += loc.qty;
    cur.locations.push(loc);
    out.set(productId, cur);
  };

  for (const [productId, addr] of Object.entries(placements)) {
    push(productId, { addr, qty: 1 });
  }
  for (const box of boxes) {
    if (!box.address) continue;
    for (const line of box.lines) {
      if (line.qty <= 0) continue;
      push(line.productId, {
        addr: box.address,
        qty: line.qty,
        boxId: box.id,
        boxBarcode: box.barcode,
      });
    }
  }
  return out;
}

/** Есть ли по этому адресу нужный товар (для проверки скана места в сборке). */
export function stockAt(
  stock: Map<string, Stock>,
  productId: string,
  addr: CellAddress,
): StockLocation | undefined {
  const key = addressKey(addr);
  return stock
    .get(productId)
    ?.locations.find((l) => addressKey(l.addr) === key);
}

// --- Метрики дашборда ---------------------------------------------------------

export interface DayBucket {
  /** Метка дня в локальном времени, формат ДД.ММ. */
  label: string;
  /** Начало суток — для сортировки и подписи. */
  ts: number;
  value: number;
}

export interface ReceivingStats {
  events: number;
  units: number;
  shortage: number;
  overage: number;
  /** Доля строк приёмки с зафиксированным расхождением, 0…1. */
  discrepancyShare: number;
  byDay: DayBucket[];
}

function dayStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function dayLabel(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Приёмка за последние `days` суток. Доля расхождений — метрика КАЧЕСТВА
 * процесса, а не объёма: она отвечает на вопрос «насколько поставщику можно
 * верить», поэтому недостачи и перестачи считаем раздельно.
 */
export function receivingStats(
  events: ReceivingEvent[],
  days = 14,
  now = Date.now(),
): ReceivingStats {
  const from = dayStart(now) - (days - 1) * 86_400_000;
  const recent = events.filter((e) => e.timestamp >= from);

  const buckets = new Map<number, number>();
  for (let i = 0; i < days; i++) {
    buckets.set(from + i * 86_400_000, 0);
  }
  let units = 0;
  let shortage = 0;
  let overage = 0;
  for (const e of recent) {
    units += e.qty;
    if (e.discrepancy === "shortage") shortage++;
    if (e.discrepancy === "overage") overage++;
    const d = dayStart(e.timestamp);
    buckets.set(d, (buckets.get(d) ?? 0) + e.qty);
  }

  return {
    events: recent.length,
    units,
    shortage,
    overage,
    discrepancyShare: recent.length
      ? (shortage + overage) / recent.length
      : 0,
    byDay: [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([ts, value]) => ({ ts, label: dayLabel(ts), value })),
  };
}

export interface RequestStats {
  new: number;
  inProgress: number;
  /** Собрано и ждёт погрузки. */
  done: number;
  /** Уехало со склада. */
  shipped: number;
  cancelled: number;
  /** Закрытых частично (собрали меньше запрошенного). */
  partial: number;
  /** Среднее время от создания заявки до закрытия, мс (null — нет данных). */
  avgLeadMs: number | null;
  /** Среднее время сборки: от «в работе» до «выполнена», мс. */
  avgPickMs: number | null;
}

export function requestStats(requests: FulfillmentRequest[]): RequestStats {
  // Отгруженная заявка тоже собрана — иначе после погрузки она выпадала бы
  // из метрик, и «среднее время сборки» считалось бы только по тому, что ещё
  // стоит на складе.
  const picked = requests.filter(
    (r) => r.status === "done" || r.status === "shipped",
  );
  const lead = picked
    .map((r) => (r.shippedAt ?? r.updatedAt) - r.createdAt)
    .filter((v) => v >= 0);
  const pick = picked
    .filter((r) => r.startedAt != null)
    .map((r) => r.updatedAt - r.startedAt!)
    .filter((v) => v >= 0);
  const avg = (xs: number[]) =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

  return {
    new: requests.filter((r) => r.status === "new").length,
    inProgress: requests.filter((r) => r.status === "in_progress").length,
    done: requests.filter((r) => r.status === "done").length,
    shipped: requests.filter((r) => r.status === "shipped").length,
    cancelled: requests.filter((r) => r.status === "cancelled").length,
    partial: picked.filter((r) => r.partial).length,
    avgLeadMs: avg(lead),
    avgPickMs: avg(pick),
  };
}

export interface FloorOccupancy {
  floorId: string;
  name: string;
  cells: number;
  occupied: number;
  fill: number;
}

export interface OccupancyStats {
  cells: number;
  occupied: number;
  fill: number;
  byFloor: FloorOccupancy[];
}

/**
 * Занятость склада. Переиспользует `allCells` из `placement.ts` — второй
 * версии расчёта у нас быть не должно, иначе дашборд и тепловая карта начнут
 * показывать разные проценты.
 */
export function occupancyStats(
  warehouse: Warehouse,
  placements: Record<string, CellAddress>,
  boxes: Box[],
): OccupancyStats {
  const cells = allCells(warehouse);
  const occupiedKeys = new Set<string>();
  for (const addr of Object.values(placements)) occupiedKeys.add(addressKey(addr));
  for (const b of boxes) {
    if (b.address && b.lines.length) occupiedKeys.add(addressKey(b.address));
  }

  const byFloor = warehouse.floors.map((f) => {
    const own = cells.filter((c) => c.addr.floorId === f.id);
    const occupied = own.filter((c) => occupiedKeys.has(addressKey(c.addr))).length;
    return {
      floorId: f.id,
      name: f.name,
      cells: own.length,
      occupied,
      fill: own.length ? occupied / own.length : 0,
    };
  });

  const occupied = byFloor.reduce((s, f) => s + f.occupied, 0);
  return {
    cells: cells.length,
    occupied,
    fill: cells.length ? occupied / cells.length : 0,
    byFloor,
  };
}

/** Человекочитаемая длительность: «2 ч 15 мин» / «3 мин». */
export function formatDuration(ms: number | null, lang: "ru" | "en"): string {
  if (ms == null) return "—";
  const min = Math.round(ms / 60_000);
  if (min < 60) return lang === "ru" ? `${min} мин` : `${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  const hours = lang === "ru" ? `${h} ч` : `${h} h`;
  if (!rest) return hours;
  return lang === "ru" ? `${hours} ${rest} мин` : `${hours} ${rest} min`;
}

// --- Группировка заявок --------------------------------------------------------

/** Заявки одного назначения: «всё, что едет в Розницу». */
export interface RequestGroup {
  /** Назначение из заявки; null — продавец его не указал. */
  target: string | null;
  /** Ближайшая дата отгрузки в группе — по ней группы и выстраиваются. */
  shipDate: number | null;
  /** Все даты отгрузки внутри группы (по возрастанию), без повторов. */
  shipDates: number[];
  items: FulfillmentRequest[];
}

/**
 * Группировка заявок по назначению. Именно назначение отвечает на вопрос «что
 * едет вместе»: одна машина увозит всё, что адресовано одному получателю, а
 * дата только говорит когда. Порядок групп — по ближайшей отгрузке; заявки без
 * назначения уходят в конец, мешать их с адресованными нечестно.
 *
 * Порядок заявок внутри группы сохраняется — сортирует их вызывающий экран.
 */
export function groupRequestsByTarget(
  requests: FulfillmentRequest[],
): RequestGroup[] {
  const byTarget = new Map<string, FulfillmentRequest[]>();
  for (const r of requests) {
    const key = r.note?.trim() || "";
    byTarget.set(key, [...(byTarget.get(key) ?? []), r]);
  }

  return [...byTarget.entries()]
    .map(([key, items]) => {
      // Даты машин берём только по НЕзакрытым заявкам. На одно и то же
      // назначение возят регулярно, и прошлые рейсы лежат в той же группе —
      // без этого фильтра шапка группы вечно показывала бы «просрочено» по
      // дате давно уехавшей машины.
      const dates = [
        ...new Set(
          items
            .filter((r) => r.status !== "shipped" && r.status !== "cancelled")
            .map((r) => r.truckDate)
            .filter((d): d is number => typeof d === "number"),
        ),
      ].sort((a, b) => a - b);
      return {
        target: key || null,
        shipDate: dates[0] ?? null,
        shipDates: dates,
        items,
      };
    })
    .sort((a, b) => {
      if (!a.target !== !b.target) return a.target ? -1 : 1;
      if (a.shipDate == null) return b.shipDate == null ? 0 : 1;
      if (b.shipDate == null) return -1;
      return a.shipDate - b.shipDate;
    });
}

// --- Дропшиппинг: сколько ожидаемого свободно (п.10.1) ---------------------------

/**
 * Свободное для брони количество в строке поставки: ожидаемое минус уже
 * принятое минус забронированное другими заявками. Без вычета брони одну и ту
 * же коробку можно было бы продать дважды.
 */
export function freeToReserve(
  line: ExpectedShipmentLine,
  requests: FulfillmentRequest[],
): number {
  const booked = (line.reservedFor ?? []).reduce((sum, id) => {
    const r = requests.find((x) => x.id === id);
    return sum + (r ? r.qty : 0);
  }, 0);
  return Math.max(0, line.expectedQty - line.receivedQty - booked);
}

/** Есть ли вообще куда бронировать этот товар (для кнопки в заявке). */
export function canReserve(
  productId: string,
  qty: number,
  shipments: ExpectedShipment[],
  requests: FulfillmentRequest[],
): boolean {
  return shipments.some(
    (sh) =>
      sh.status !== "closed" &&
      sh.lines.some(
        (l) => l.productId === productId && freeToReserve(l, requests) >= qty,
      ),
  );
}

// --- Календарь заявок (п.10.4) ---------------------------------------------------

export interface CalendarDay {
  /** Начало суток. */
  ts: number;
  items: FulfillmentRequest[];
  qty: number;
  /** Всё ли по этому дню уже собрано или уехало. */
  done: boolean;
}

/**
 * Заявки по дням отгрузки. Источник данных тот же `FulfillmentRequest[]`, что и
 * у списка, — календарь это ДРУГОЕ ПРЕДСТАВЛЕНИЕ, а не вторая модель.
 * Заявки без даты машины сюда не попадают: их место — в списке.
 */
export function requestsByDay(requests: FulfillmentRequest[]): CalendarDay[] {
  const byDay = new Map<number, FulfillmentRequest[]>();
  for (const r of requests) {
    if (r.truckDate == null) continue;
    const key = dayStart(r.truckDate);
    byDay.set(key, [...(byDay.get(key) ?? []), r]);
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ts, items]) => ({
      ts,
      items,
      qty: items.reduce((s, r) => s + r.qty, 0),
      done: items.every((r) => r.status === "done" || r.status === "shipped"),
    }));
}

// --- Стоимость хранения (п.10.5) -------------------------------------------------

/**
 * Стоимость хранения за период: занятые ячейки × тариф × дни. Сознательно
 * узкая метрика, а не финансовый отчёт: счетов и платежей в прототипе нет, и
 * выдумывать их ради красивой цифры нельзя.
 */
export function storageCost(
  occupied: number,
  ratePerCell: number | undefined,
  days: number,
): number | null {
  if (!ratePerCell || ratePerCell <= 0) return null;
  return occupied * ratePerCell * days;
}

// --- Нагрузка персонала -------------------------------------------------------

export interface StaffWorkload {
  staffId: string;
  /** Операций приёмки и принятых единиц. */
  receipts: number;
  units: number;
  /** Рейсов отгружено. */
  trips: number;
  /** Последняя операция сотрудника — когда он работал в последний раз. */
  lastAt: number | null;
}

/**
 * Кто сколько сделал: приёмка и отгрузка. Считаем ТОЛЬКО по фактам, которые
 * пишет система (`ReceivingEvent.staffId`, `Shipment.staffId`); сборка
 * персонально не подписывается, поэтому в нагрузку не попадает — выдумывать
 * цифру, которой нет в данных, нельзя.
 */
export function staffWorkload(
  events: ReceivingEvent[],
  shipments: Shipment[],
): Map<string, StaffWorkload> {
  const map = new Map<string, StaffWorkload>();
  const get = (id: string): StaffWorkload => {
    const cur = map.get(id);
    if (cur) return cur;
    const next: StaffWorkload = {
      staffId: id,
      receipts: 0,
      units: 0,
      trips: 0,
      lastAt: null,
    };
    map.set(id, next);
    return next;
  };

  for (const e of events) {
    if (!e.staffId) continue;
    const w = get(e.staffId);
    w.receipts += 1;
    w.units += e.qty;
    w.lastAt = Math.max(w.lastAt ?? 0, e.timestamp);
  }
  for (const s of shipments) {
    if (!s.staffId) continue;
    const w = get(s.staffId);
    w.trips += 1;
    w.lastAt = Math.max(w.lastAt ?? 0, s.shippedAt);
  }
  return map;
}
