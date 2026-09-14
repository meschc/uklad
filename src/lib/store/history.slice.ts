import type { StoreApi, UseBoundStore } from "zustand";
import { setAddressingConfig } from "../address";
import type {
  AddressingConfig,
  CategoryField,
  CellAddress,
  Product,
  ShelfTemplate,
  Warehouse,
} from "../types";
import type { EditorState, HistorySlice, SliceCreator } from "./state";

/**
 * Отмена/повтор. Снимки пишутся подпиской (см. `installHistory`), а не вызовом
 * commit() в каждом редьюсере: правок три десятка, инструментировать каждую —
 * источник забытых мест. Всплеск изменений (перетаскивание, серия кликов по
 * степперу) склеивается в один шаг.
 */

/**
 * Снимок доменных данных для отмены. Благодаря иммутабельным апдейтам снимок
 * почти ничего не стоит: неизменившиеся этажи и модули переиспользуются по
 * ссылке, копируются только верхние объекты.
 */
export interface HistorySnapshot {
  warehouse: Warehouse;
  otherWarehouses: Warehouse[];
  activeFloorId: string;
  products: Product[];
  placements: Record<string, CellAddress>;
  categoryFields: CategoryField[];
  fieldValues: Record<string, string>;
  templates: ShelfTemplate[];
  addressing: AddressingConfig;
}

const HISTORY_LIMIT = 60;

/**
 * Пауза, после которой всплеск правок считается законченным. Перетаскивание
 * модуля даёт десятки изменений подряд — без склейки каждое стало бы отдельным
 * шагом отмены, и Ctrl+Z пришлось бы жать столько же раз, сколько было кадров.
 */
const COALESCE_MS = 450;

function snapshot(s: EditorState): HistorySnapshot {
  return {
    warehouse: s.warehouse,
    otherWarehouses: s.otherWarehouses,
    activeFloorId: s.activeFloorId,
    products: s.products,
    placements: s.placements,
    categoryFields: s.categoryFields,
    fieldValues: s.fieldValues,
    templates: s.templates,
    addressing: s.addressing,
  };
}

/** Изменились ли доменные данные (а не выделение/зум/диалоги). */
function domainChanged(a: EditorState, b: EditorState): boolean {
  return (
    a.warehouse !== b.warehouse ||
    a.otherWarehouses !== b.otherWarehouses ||
    a.products !== b.products ||
    a.placements !== b.placements ||
    a.categoryFields !== b.categoryFields ||
    a.fieldValues !== b.fieldValues ||
    a.templates !== b.templates ||
    a.addressing !== b.addressing
  );
}

// --- Запись истории ----------------------------------------------------------

type EditorStore = UseBoundStore<StoreApi<EditorState>>;

let store: EditorStore | null = null;
let timeTraveling = false;
let pendingPrev: HistorySnapshot | null = null;
// Не `window.setTimeout`, как в компонентах: этот модуль выполняется сразу при
// импорте стора — в том числе там, где окна нет вовсе (тесты на окружении node).
let coalesceTimer: ReturnType<typeof setTimeout> | undefined;

/** Дописать отложенный снимок в историю немедленно. */
function flushHistory() {
  if (!pendingPrev || !store) return;
  const entry = pendingPrev;
  pendingPrev = null;
  if (coalesceTimer) clearTimeout(coalesceTimer);
  coalesceTimer = undefined;
  store.setState((s) => ({
    past: [...s.past, entry].slice(-HISTORY_LIMIT),
    future: [],
  }));
}

/**
 * Подписать стор на запись истории. Вызывается один раз при сборке стора —
 * до этого момента у слайса нет ссылки на сам стор (он ещё создаётся).
 */
export function installHistory(s: EditorStore) {
  store = s;
  s.subscribe((next, prev) => {
    if (timeTraveling) return;
    if (!domainChanged(next, prev)) return;
    // Держим САМОЕ раннее состояние всплеска — тогда отмена вернёт к началу жеста.
    if (!pendingPrev) pendingPrev = snapshot(prev);
    if (coalesceTimer) clearTimeout(coalesceTimer);
    coalesceTimer = setTimeout(flushHistory, COALESCE_MS);
  });
}

export const createHistorySlice: SliceCreator<HistorySlice> = (set, get) => ({
  past: [],
  future: [],

  undo: () => {
    flushHistory();
    const s = get();
    if (!s.past.length) return;
    const prev = s.past[s.past.length - 1];
    timeTraveling = true;
    set({
      ...prev,
      past: s.past.slice(0, -1),
      future: [...s.future, snapshot(s)],
      selection: [],
      activeShelf: null,
    });
    setAddressingConfig(prev.addressing);
    timeTraveling = false;
  },

  redo: () => {
    const s = get();
    if (!s.future.length) return;
    const next = s.future[s.future.length - 1];
    timeTraveling = true;
    set({
      ...next,
      past: [...s.past, snapshot(s)],
      future: s.future.slice(0, -1),
      selection: [],
      activeShelf: null,
    });
    setAddressingConfig(next.addressing);
    timeTraveling = false;
  },
});
