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
  // Какие услуги склад оказывает и почём — у каждого склада свои.
  "serviceSettings",
] as const;

export type WarehouseData = Pick<EditorState, (typeof WAREHOUSE_DOMAINS)[number]>;

/**
 * Пустая работа — с неё начинается созданный пользователем склад. Настройку
 * услуг новый склад берёт копией с того, откуда его открыли: так цены не
 * приходится вбивать с нуля, а правка на новом складе не трогает старый.
 */
export function emptyWarehouseData(
  serviceSettings: EditorState["serviceSettings"] = { enabled: {}, prices: {} },
): WarehouseData {
  return {
    serviceSettings: structuredClone(serviceSettings),
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
  // Сохранённая работа дополняется пустыми списками: запись прошлой версии
  // без нового домена не должна оставить в сторе undefined.
  const next = saved
    ? { ...emptyWarehouseData(s.serviceSettings), ...saved }
    : targetOwnCatalog
      ? emptyWarehouseData(s.serviceSettings)
      : pickWarehouseData(s);
  return { ...next, warehouseData: stash };
}

/** Сколько работы у склада — для предупреждения перед удалением. */
export function warehouseWorkCount(s: EditorState, id: string) {
  const d = s.warehouse.id === id ? pickWarehouseData(s) : s.warehouseData[id];
  if (!d) return null;
  const n = {
    shipments: d.expectedShipments.length,
    requests: d.requests.length,
    boxes: d.boxes.length,
    trips: d.shipments.length,
  };
  return { ...n, total: n.shipments + n.requests + n.boxes + n.trips };
}
