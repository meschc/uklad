import { clamp, nowMs } from "../utils";
import type { PrintSlice, SliceCreator, ViewSlice } from "./state";

/** Пределы зума холста. Дублируют ZOOM_MIN/ZOOM_MAX редактора намеренно:
 *  слой данных не должен зависеть от компонентов. */
const ZOOM_LO = 0.2;
const ZOOM_HI = 4;

/** Режим экрана склада, камера холста и транзиентные уведомления. */
/**
 * Предпросмотр печати — часть экранного состояния, а не домена: он не
 * персистится и живёт рядом с режимом просмотра.
 */
export const createPrintSlice: SliceCreator<PrintSlice> = (set) => ({
  printPreviewOpen: false,
  setPrintPreview: (open) => set({ printPreviewOpen: open }),
});

export const createViewSlice: SliceCreator<ViewSlice> = (set) => ({
  mode: "2d",
  zoom: 1,
  pan: { x: 0, y: 0 },
  toast: null,

  setMode: (mode) => set({ mode }),

  setZoom: (zoom) => set({ zoom: clamp(zoom, ZOOM_LO, ZOOM_HI) }),
  setView: (zoom, pan) => set({ zoom: clamp(zoom, ZOOM_LO, ZOOM_HI), pan }),
  setPan: (pan) => set({ pan }),

  showToast: (key, vars) => set({ toast: { id: nowMs() + Math.random(), key, vars } }),
});
