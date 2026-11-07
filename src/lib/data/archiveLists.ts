import {
  isDispute,
  isDocRecord,
  isExpectedShipment,
  isOutboundBox,
  isReceivingEvent,
  isRequest,
  isStaffEvent,
  isTask,
  keepValid,
  type Guard,
} from "./guards";
import type { ArchiveRow } from "./historyRepository";

/**
 * Архив с сервера → списки кабинета (окно истории, `store/archive.ts`):
 * разложить строки по складам в прежнем порядке, проверить форму, как при
 * загрузке кабинета, и подмешать к живому.
 */

/** Рейс: проверки в `guards.ts` нет — рейсы в сторе не проверяются. */
function isTrip(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return false;
  const t = v as Record<string, unknown>;
  return typeof t.id === "string" && Array.isArray(t.requestIds) && typeof t.shippedAt === "number";
}

/** Списки, которые сервер уводит в архив. Тара и паллеты — вещи склада, не история. */
const GUARDS = {
  requests: isRequest,
  expectedShipments: isExpectedShipment,
  receivingEvents: isReceivingEvent,
  shipments: isTrip,
  tasks: isTask,
  disputes: isDispute,
  outboundBoxes: isOutboundBox,
  docRecords: isDocRecord,
  staffEvents: isStaffEvent,
} satisfies Record<string, (v: unknown) => boolean>;
export type ArchiveList = keyof typeof GUARDS;
/** Списки, где новое — сверху: архив (старое) идёт после живого. */
const NEWEST_FIRST = new Set<ArchiveList>([
  "expectedShipments",
  "requests",
  "shipments",
  "tasks",
  "disputes",
]);

export type Lists = Partial<Record<ArchiveList, unknown[]>>;

/** Строки архива → списки по складам, в том порядке, в каком они были в кабинете. */
export function groupArchive(rows: ArchiveRow[]): Record<string, Lists> {
  const sorted = [...rows].sort((a, b) => a.pos - b.pos);
  const out: Record<string, Record<string, unknown[]>> = {};
  for (const r of sorted) {
    if (!(r.d in GUARDS)) continue;
    ((out[r.w] ??= {})[r.d] ??= []).push(r.data);
  }
  for (const [w, lists] of Object.entries(out)) {
    for (const [d, list] of Object.entries(lists)) {
      const guard = GUARDS[d as ArchiveList] as Guard<unknown>;
      lists[d] = keepValid(list, guard, `archive.${w || "company"}.${d}`).items;
    }
  }
  return out as Record<string, Lists>;
}

/**
 * Живое + архив одним списком. Запись, которая есть и там и там (копия на
 * этом устройстве была открыта до архивации), берётся живой.
 */
export function mergeArchive<T>(key: ArchiveList, live: T[], archived: unknown[] | undefined): T[] {
  if (!archived || archived.length === 0) return live;
  const ids = new Set(live.map((x) => (x as { id?: unknown }).id));
  const old = archived.filter((x) => !ids.has((x as { id?: unknown }).id)) as T[];
  if (old.length === 0) return live;
  return NEWEST_FIRST.has(key) ? [...live, ...old] : [...old, ...live];
}
