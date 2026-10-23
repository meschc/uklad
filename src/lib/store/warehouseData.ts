import { EMPTY_RECEIVING } from "../receiving";
import type { EditorState } from "./state";

/**
 * Работа склада — поставки, приёмка, тара, заявки, рейсы, задания. В сторе
 * эти списки лежат плоско и принадлежат АКТИВНОМУ складу; данные остальных
 * складов ждут своей очереди в `warehouseData` по id склада. При открытии
 * склада списки меняются местами (`swapWarehouseData`).
 *
 * Без этого склады делили одну историю: новый склад открывался с чужими
 * поставками и заявками, а приёмка на одном складе появлялась на другом.
 */
export const WAREHOUSE_DOMAINS = [
  "expectedShipments",
  "receivingEvents",
  "boxes",
  "pallets",
  "receiving",
  "requests",
  "shipments",
  "tasks",
] as const;

export type WarehouseData = Pick<EditorState, (typeof WAREHOUSE_DOMAINS)[number]>;

/** Пустая работа — с неё начинается созданный пользователем склад. */
export function emptyWarehouseData(): WarehouseData {
  return {
    expectedShipments: [],
    receivingEvents: [],
    boxes: [],
    pallets: [],
    receiving: EMPTY_RECEIVING,
    requests: [],
    shipments: [],
    tasks: [],
  };
}

export function pickWarehouseData(s: EditorState): WarehouseData {
  const out = {} as Record<string, unknown>;
  for (const k of WAREHOUSE_DOMAINS) out[k] = s[k];
  return out as WarehouseData;
}

/**
 * Что положить в стор при переходе с активного склада на `targetId`.
 * Прежняя работа уходит в `warehouseData`, сохранённая работа цели — в стор.
 * Демо-склад без сохранённой работы продолжает общую демо-историю, как было
 * до разделения; склад со своим каталогом начинает с нуля.
 */
export function swapWarehouseData(
  s: EditorState,
  targetId: string,
  targetOwnCatalog: boolean | undefined,
): Partial<EditorState> {
  const stash = { ...s.warehouseData, [s.warehouse.id]: pickWarehouseData(s) };
  const saved = stash[targetId];
  delete stash[targetId];
  const next = saved ?? (targetOwnCatalog ? emptyWarehouseData() : pickWarehouseData(s));
  return { ...next, warehouseData: stash };
}
