import type {
  Box,
  FulfillmentRequest,
  OperationEntry,
  Pallet,
  Product,
  ReceivingEvent,
  ServiceKind,
  ServiceSettings,
  ServiceUnit,
  Shipment,
  WarehouseTask,
} from "./types";

/**
 * Учёт услуг склада: какие операции бывают, как из фактов собирается журнал
 * и как журнал превращается в отчёт для счёта продавцу. Чистые функции — о
 * хранилище не знают, стор только подаёт им данные.
 */

export interface ServiceSpec {
  kind: ServiceKind;
  unit: ServiceUnit;
  /** Считается системой по фактам, а не заданием. */
  auto: boolean;
  /** Включена ли у склада по умолчанию — то, что есть на любом складе. */
  defaultOn: boolean;
}

/**
 * Каталог услуг в порядке пути товара: от ворот до машины. Порядок здесь и
 * есть порядок строк в настройке и в отчёте — человек читает их как маршрут.
 */
export const SERVICES: ServiceSpec[] = [
  { kind: "unloading", unit: "vehicle", auto: false, defaultOn: false },
  { kind: "cargo_pallet", unit: "pallet", auto: true, defaultOn: true },
  { kind: "cargo_box", unit: "box", auto: true, defaultOn: true },
  { kind: "item_receiving", unit: "unit", auto: true, defaultOn: true },
  { kind: "quality_check", unit: "unit", auto: false, defaultOn: false },
  { kind: "marking", unit: "unit", auto: false, defaultOn: true },
  { kind: "honest_sign", unit: "unit", auto: false, defaultOn: false },
  { kind: "repacking", unit: "unit", auto: false, defaultOn: false },
  { kind: "kitting", unit: "unit", auto: false, defaultOn: false },
  { kind: "picking", unit: "unit", auto: true, defaultOn: true },
  { kind: "packing", unit: "order", auto: false, defaultOn: true },
  { kind: "fbo_box", unit: "box", auto: false, defaultOn: false },
  { kind: "palletizing", unit: "pallet", auto: false, defaultOn: false },
  { kind: "loading", unit: "trip", auto: true, defaultOn: true },
  { kind: "returns", unit: "unit", auto: false, defaultOn: true },
  { kind: "inventory", unit: "cell", auto: false, defaultOn: false },
  { kind: "photo", unit: "unit", auto: false, defaultOn: false },
];

const SPEC = new Map(SERVICES.map((s) => [s.kind, s]));

export function serviceSpec(kind: ServiceKind): ServiceSpec | undefined {
  return SPEC.get(kind);
}

export function isServiceKind(v: unknown): v is ServiceKind {
  return typeof v === "string" && SPEC.has(v as ServiceKind);
}

/** Включена ли услуга у склада: явная настройка, иначе — значение по умолчанию. */
export function isServiceOn(settings: ServiceSettings, kind: ServiceKind): boolean {
  return settings.enabled?.[kind] ?? SPEC.get(kind)?.defaultOn ?? false;
}

/** Услуги, на которые можно завести задание: включённые и не авто. */
export function taskKinds(settings: ServiceSettings): ServiceKind[] {
  return SERVICES.filter((s) => !s.auto && isServiceOn(settings, s.kind)).map((s) => s.kind);
}

export interface OperationFacts {
  tasks: WarehouseTask[];
  pallets: Pallet[];
  boxes: Box[];
  receivingEvents: ReceivingEvent[];
  requests: FulfillmentRequest[];
  shipments: Shipment[];
  products: Product[];
}

/**
 * Журнал операций: все оказанные услуги одним списком.
 *
 * Собирается из фактов, которые система и так пишет, плюс закрытых заданий.
 * Не хранится отдельно — иначе два источника правды разъехались бы на первой
 * же отменённой приёмке. Продавец определяется по товару: паллета товара не
 * знает и остаётся без продавца, короб берёт продавца первой строки.
 */
export function operationLog(f: OperationFacts): OperationEntry[] {
  const partnerOf = new Map(f.products.map((p) => [p.id, p.partnerId]));
  const requestById = new Map(f.requests.map((r) => [r.id, r]));
  const out: OperationEntry[] = [];

  for (const p of f.pallets) {
    out.push({ id: `pal:${p.id}`, kind: "cargo_pallet", qty: 1, at: p.createdAt, source: "auto" });
  }
  for (const b of f.boxes) {
    const first = b.lines[0];
    out.push({
      id: `box:${b.id}`,
      kind: "cargo_box",
      qty: 1,
      at: b.createdAt,
      partnerId: first ? partnerOf.get(first.productId) : undefined,
      source: "auto",
    });
  }
  for (const e of f.receivingEvents) {
    out.push({
      id: `rcv:${e.id}`,
      kind: "item_receiving",
      qty: e.qty,
      at: e.timestamp,
      staffId: e.staffId,
      partnerId: partnerOf.get(e.productId),
      source: "auto",
    });
  }
  // Сборка: собранное количество, а не заказанное — частично собранная заявка
  // оплачивается по факту. Отменённая до сборки не стоила складу ничего.
  for (const r of f.requests) {
    const picked = r.pickedQty ?? (r.status === "done" || r.status === "shipped" ? r.qty : 0);
    if (picked <= 0 || r.status === "new") continue;
    out.push({
      id: `pick:${r.id}`,
      kind: "picking",
      qty: picked,
      at: r.updatedAt,
      partnerId: partnerOf.get(r.productId),
      source: "auto",
    });
  }
  for (const s of f.shipments) {
    const first = s.requestIds.map((id) => requestById.get(id)).find(Boolean);
    out.push({
      id: `trip:${s.id}`,
      kind: "loading",
      qty: 1,
      at: s.shippedAt,
      staffId: s.staffId,
      partnerId: first ? partnerOf.get(first.productId) : undefined,
      source: "auto",
    });
  }
  for (const t of f.tasks) {
    if (t.status !== "done" || t.doneAt == null) continue;
    out.push({
      id: `task:${t.id}`,
      kind: t.kind,
      qty: t.qty,
      at: t.doneAt,
      staffId: t.staffId,
      partnerId: t.partnerId,
      source: "task",
    });
  }
  return out.sort((a, b) => b.at - a.at);
}

export interface ReportRow {
  kind: ServiceKind;
  unit: ServiceUnit;
  qty: number;
  price: number | null;
  /** null — цена не задана: «0 ₽» здесь соврал бы, что услуга бесплатная. */
  sum: number | null;
}

export interface ServiceReport {
  rows: ReportRow[];
  /** Сумма по строкам с заданной ценой. */
  total: number;
  /** Есть строки без цены — итог неполный, и экран обязан это сказать. */
  unpriced: boolean;
}

export interface ReportFilter {
  from: number;
  to: number;
  /** Только этот продавец. Пусто — все. */
  partnerId?: string;
}

/**
 * Отчёт по услугам за период: строка на вид услуги в порядке каталога.
 * Выключенные услуги в отчёт не попадают, даже если факты по ним были, —
 * склад их не продаёт, и выставлять их в счёт нельзя.
 */
export function serviceReport(
  log: OperationEntry[],
  settings: ServiceSettings,
  filter: ReportFilter,
): ServiceReport {
  const qty = new Map<ServiceKind, number>();
  for (const e of log) {
    if (e.at < filter.from || e.at > filter.to) continue;
    if (filter.partnerId && e.partnerId !== filter.partnerId) continue;
    qty.set(e.kind, (qty.get(e.kind) ?? 0) + e.qty);
  }
  const rows: ReportRow[] = [];
  let total = 0;
  let unpriced = false;
  for (const s of SERVICES) {
    const n = qty.get(s.kind) ?? 0;
    if (n === 0 || !isServiceOn(settings, s.kind)) continue;
    const price = settings.prices?.[s.kind] ?? null;
    const sum = price == null ? null : Math.round(price * n * 100) / 100;
    if (sum == null) unpriced = true;
    else total += sum;
    rows.push({ kind: s.kind, unit: s.unit, qty: n, price, sum });
  }
  return { rows, total: Math.round(total * 100) / 100, unpriced };
}
