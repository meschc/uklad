import type { Box, CellAddress, Floor, OperationEntry, Product, ShelfConfig } from "./types";

/**
 * Хранение как услуга: сколько паллето-мест и коробов товар продавца занимает
 * на складе — по суткам (Кирилл 15.11: «должно быть хранение как услуга»).
 *
 * Снимок кабинета знает только «где лежит сейчас», поэтому сутки пишет
 * сервер: после каждой записи работы склада он считает занятость и кладёт её
 * строкой на сегодня (`server/api/src/cabinet/storage.js`, миграция 036).
 * Отчёт получает строки за период (`storageRepository`) и восстанавливает
 * каждые сутки: день без записей ничего на полках не менял, его занятость —
 * последняя строка до него (`storageEntries`).
 *
 * Правила счёта — те же, что на сервере (менять в обоих местах):
 * - хранение начинается с размещения: тара без адреса места не занимает;
 * - паллето-место — ячейка полки с отметкой «паллетное место», где лежит
 *   товар продавца: сколько бы тары ни стояло в ячейке, место одно;
 * - остальная тара на местах хранения — короб каждая; товар в ячейке без
 *   тары — один короб на ячейку;
 * - продавец — по товару; тара двух продавцов занимает место у каждого;
 * - невскрытые места грузовой приёмки товара по учёту не держат — пока не
 *   считаются.
 */

/** Занятость склада в одни сутки: строка на продавца. */
export interface StorageRow {
  /** Сутки по Москве, `YYYY-MM-DD`. */
  day: string;
  /** Продавец; пустая строка — свой товар склада. */
  partner: string;
  pallets: number;
  boxes: number;
}

const DAY_MS = 86_400_000;
/** Сутки склада — по Москве, как пишет сервер. */
const MSK_MS = 3 * 3_600_000;

/** Сутки по Москве для момента времени. */
export function storageDay(ms: number): string {
  return new Date(ms + MSK_MS).toISOString().slice(0, 10);
}

/** Полдень суток по Москве — момент, которым сутки хранения ложатся в журнал. */
function noonOf(day: string): number {
  return Date.parse(`${day}T12:00:00+03:00`);
}

const nextDay = (day: string) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);

function shelfOf(floors: readonly Floor[], a: CellAddress): ShelfConfig | undefined {
  const floor = floors.find((f) => f.id === a.floorId);
  if (!floor) return undefined;
  const own = floor.aliasOf ? (floors.find((f) => f.id === floor.aliasOf) ?? floor) : floor;
  return own.modules.find((m) => m.id === a.moduleId)?.shelves?.[a.shelfIndex];
}

const cellKey = (a: CellAddress) => `${a.floorId}/${a.moduleId}/${a.shelfIndex}/${a.cellIndex}`;

export interface StorageFacts {
  floors: readonly Floor[];
  boxes: readonly Box[];
  products: readonly Product[];
  placements: Readonly<Record<string, CellAddress>>;
}

/** Занятость склада сейчас — строка на продавца, у которого что-то лежит. */
export function storageTally(f: StorageFacts): Omit<StorageRow, "day">[] {
  const partnerOf = new Map(f.products.map((p) => [p.id, p.partnerId ?? ""]));
  const floorIds = new Set(f.floors.map((x) => x.id));
  const pallets = new Map<string, Set<string>>();
  const boxes = new Map<string, number>();
  const put = (partner: string, a: CellAddress) => {
    if (shelfOf(f.floors, a)?.palletPlace) {
      const cells = pallets.get(partner) ?? new Set<string>();
      cells.add(cellKey(a));
      pallets.set(partner, cells);
    } else {
      boxes.set(partner, (boxes.get(partner) ?? 0) + 1);
    }
  };
  for (const b of f.boxes) {
    if (b.sealed || !b.address || !floorIds.has(b.address.floorId)) continue;
    const partners = new Set(
      b.lines.filter((l) => l.qty > 0).map((l) => partnerOf.get(l.productId) ?? ""),
    );
    for (const partner of partners) put(partner, b.address);
  }
  const loose = new Set<string>();
  for (const [productId, a] of Object.entries(f.placements)) {
    const partner = partnerOf.get(productId);
    if (partner === undefined || !floorIds.has(a.floorId)) continue;
    const key = `${partner}\u0000${cellKey(a)}`;
    if (loose.has(key)) continue;
    loose.add(key);
    put(partner, a);
  }
  return [...new Set([...pallets.keys(), ...boxes.keys()])].sort().map((partner) => ({
    partner,
    pallets: pallets.get(partner)?.size ?? 0,
    boxes: boxes.get(partner) ?? 0,
  }));
}

/**
 * Сутки хранения за период — строками журнала операций: на каждые сутки и
 * продавца — паллето-места и короба. Занятость дня — последняя строка не позже
 * его. До первой строки хранения не было (сервер начал считать с неё), после
 * `today` суток ещё не было.
 */
export function storageEntries(
  rows: readonly StorageRow[],
  from: number,
  to: number,
  today: string,
): OperationEntry[] {
  if (rows.length === 0) return [];
  const sorted = [...rows].sort((a, b) => a.day.localeCompare(b.day));
  const start = [storageDay(from), sorted[0].day].sort()[1];
  const end = [storageDay(to), today].sort()[0];
  const out: OperationEntry[] = [];
  const now = new Map<string, StorageRow>();
  let i = 0;
  for (let day = start; day <= end; day = nextDay(day)) {
    while (i < sorted.length && sorted[i].day <= day) {
      now.set(sorted[i].partner, sorted[i]);
      i++;
    }
    for (const r of now.values()) {
      const base = { at: noonOf(day), partnerId: r.partner || undefined, source: "auto" as const };
      if (r.pallets > 0) {
        out.push({
          ...base,
          id: `stor:p:${day}:${r.partner}`,
          kind: "storage_pallet",
          qty: r.pallets,
        });
      }
      if (r.boxes > 0) {
        out.push({ ...base, id: `stor:b:${day}:${r.partner}`, kind: "storage_box", qty: r.boxes });
      }
    }
  }
  return out;
}
