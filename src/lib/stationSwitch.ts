import type { WorkstationKind } from "./types";

/**
 * Смена процесса за столом без выхода (Кирилл 15–16.11): упаковщик закончил
 * и пошёл на сортировку с тем же ТСД — он просит другой процесс, старший
 * разрешает в кабинете («Подтверждения»), сервер меняет и держит процесс.
 * Просить можно только процесс, который разрешает роль: право то же, что
 * сервер требует у операций этого процесса (`OP_PERM` в `deskOps.js`).
 *
 * Чистые правила — о хранилище не знают.
 */

/** Процессы, у которых уже есть свой экран стола, — в порядке потока товара. */
export const OPEN_STATIONS: readonly WorkstationKind[] = [
  "receiving",
  "picking",
  "pack",
  "sorting",
  "shipping",
  "inventory",
];

/**
 * Какое право роли открывает процесс. Сортировка — часть отгрузки:
 * отдельного права у роли нет, как и на сервере.
 */
const STATION_PERM: Readonly<Partial<Record<WorkstationKind, string>>> = {
  receiving: "receiving.do",
  picking: "picking.do",
  pack: "packing.do",
  sorting: "shipping.do",
  shipping: "shipping.do",
  inventory: "inventory.count",
};

/**
 * Процессы, на которые человек может перейти. `permissions` нет — демо без
 * сервера: прав там не считают, доступны все открытые процессы. `null` —
 * роль не назначена: никуда.
 */
export function stationsFor(permissions: readonly string[] | null | undefined): WorkstationKind[] {
  if (permissions === undefined) return [...OPEN_STATIONS];
  const have = new Set(permissions ?? []);
  return OPEN_STATIONS.filter((st) => {
    const need = STATION_PERM[st];
    return !!need && have.has(need);
  });
}

/** Можно ли перейти на этот процесс: он открыт, разрешён и не текущий. */
export function maySwitchTo(
  current: WorkstationKind,
  to: WorkstationKind,
  permissions: readonly string[] | null | undefined,
): boolean {
  return to !== current && stationsFor(permissions).includes(to);
}
