import { clamp, uid } from "../utils";
import {
  CELLS_MAX,
  CELLS_MIN,
  DEFAULT_SHELF_CELLS,
  PICK_PRIORITY_MAX,
  PICK_PRIORITY_MIN,
  SHELF_MAX,
  SHELF_MIN,
  type LayoutTemplate,
  type PlacedModule,
  type ShelfTemplate,
} from "../types";
import type { ShelvesSlice, SliceCreator } from "./state";
import { goodsAt, mutateActiveFloor, nameForCells, nameForLayout } from "./helpers";
import { seedTemplates } from "./seed";

/**
 * Внутренняя структура секции — полки и ячейки (ТЗ, разд. 2.3) — и две
 * библиотеки шаблонов: раскладка полок одной секции и раскладка группы модулей
 * («компонент как в Figma», #38).
 *
 * Любая правка, уничтожающая ячейки с товаром, сначала поднимает алерт
 * «на полке товар» (ТЗ, разд. 4), а сама операция уходит в `commit`.
 */
export const createShelvesSlice: SliceCreator<ShelvesSlice> = (set, get) => ({
  activeShelf: null,
  templates: seedTemplates(),
  layoutTemplates: [],
  stampTemplateId: null,

  setShelfCount: (id, count) => {
    const s = get();
    const n = clamp(Math.round(count), SHELF_MIN, SHELF_MAX);
    const doIt = () =>
      set((st) =>
        mutateActiveFloor(st, (f) => {
          const m = f.modules.find((x) => x.id === id);
          if (!m || m.type !== "section") return;
          const cur = m.shelves ?? [];
          if (n === cur.length) return;
          if (n < cur.length) {
            m.shelves = cur.slice(0, n);
          } else {
            const fill = cur[cur.length - 1]?.cells ?? DEFAULT_SHELF_CELLS;
            m.shelves = [
              ...cur,
              ...Array.from({ length: n - cur.length }, () => ({
                id: uid("shelf"),
                cells: fill,
              })),
            ];
          }
        }),
      );
    // Полки срезаются с конца — теряются товары с полок ниже нового счётчика.
    const lost = goodsAt(
      s.placements,
      (a) => a.moduleId === id && a.shelfIndex >= n,
    );
    if (lost.length) {
      set({
        pendingConflict: {
          titleKey: "conflict.reason.shelfCount",
          productIds: lost,
          commit: doIt,
        },
      });
      return;
    }
    doIt();
  },

  setShelfCells: (id, index, cells) => {
    const s = get();
    const n = clamp(Math.round(cells), CELLS_MIN, CELLS_MAX);
    const doIt = () =>
      set((st) =>
        mutateActiveFloor(st, (f) => {
          const m = f.modules.find((x) => x.id === id);
          if (!m || m.type !== "section" || !m.shelves?.[index]) return;
          m.shelves = m.shelves.map((sh, i) =>
            i === index ? { ...sh, cells: n } : sh,
          );
        }),
      );
    const lost = goodsAt(
      s.placements,
      (a) => a.moduleId === id && a.shelfIndex === index && a.cellIndex >= n,
    );
    if (lost.length) {
      set({
        pendingConflict: {
          titleKey: "conflict.reason.shelfCells",
          titleVars: { n: index + 1 },
          productIds: lost,
          commit: doIt,
        },
      });
      return;
    }
    doIt();
  },

  applyShelvesToSelection: (cells) => {
    const s = get();
    const norm = cells
      .slice(0, SHELF_MAX)
      .map((c) => clamp(Math.round(c), CELLS_MIN, CELLS_MAX));
    const doIt = () =>
      set((st) =>
        mutateActiveFloor(st, (f) => {
          for (const m of f.modules) {
            if (!st.selection.includes(m.id) || m.type !== "section") continue;
            m.shelves = norm.map((c) => ({ id: uid("shelf"), cells: c }));
          }
        }),
      );
    // Новая раскладка перекрывает старую: теряется всё, что вне её границ.
    const lost = goodsAt(
      s.placements,
      (a) =>
        s.selection.includes(a.moduleId) &&
        (a.shelfIndex >= norm.length || a.cellIndex >= norm[a.shelfIndex]),
    );
    if (lost.length) {
      set({
        pendingConflict: {
          titleKey: "conflict.reason.layout",
          productIds: lost,
          commit: doIt,
        },
      });
      return;
    }
    doIt();
  },

  setActiveShelf: (moduleId, index) => set({ activeShelf: { moduleId, index } }),

  clearActiveShelf: () => set({ activeShelf: null }),

  setShelfNumber: (moduleId, index, number) =>
    set((s) =>
      mutateActiveFloor(s, (f) => {
        const m = f.modules.find((x) => x.id === moduleId);
        const sh = m?.shelves?.[index];
        if (sh) sh.number = number;
      }),
    ),

  /**
   * Приоритет отбора и «не отбирать отсюда» (п.10.2). Полки пересобираем
   * новым массивом, а не правкой объекта на месте: у связанных этажей полки
   * общие по ссылке, и правка на месте молча ушла бы в чужой снимок истории.
   */
  setShelfPicking: (moduleId, index, patch) =>
    set((s) =>
      mutateActiveFloor(s, (f) => {
        const m = f.modules.find((x) => x.id === moduleId);
        if (!m?.shelves?.[index]) return;
        m.shelves = m.shelves.map((sh, i) => {
          if (i !== index) return sh;
          const next = { ...sh };
          if ("pickPriority" in patch) {
            const v = patch.pickPriority;
            next.pickPriority =
              v == null
                ? undefined
                : clamp(Math.round(v), PICK_PRIORITY_MIN, PICK_PRIORITY_MAX);
          }
          if (patch.pickable != null) {
            // `true` — это значение по умолчанию, хранить его незачем.
            next.pickable = patch.pickable ? undefined : false;
          }
          return next;
        });
      }),
    ),

  addTemplate: (cells, name) => {
    const norm = cells
      .slice(0, SHELF_MAX)
      .map((c) => clamp(Math.round(c), CELLS_MIN, CELLS_MAX));
    const tpl: ShelfTemplate = {
      id: uid("tpl"),
      name: name?.trim() || nameForCells(norm),
      cells: norm,
    };
    set((s) => ({ templates: [tpl, ...s.templates] }));
    return tpl.id;
  },

  removeTemplate: (id) =>
    set((s) => ({ templates: s.templates.filter((t) => t.id !== id) })),

  applyTemplateToSelection: (templateId) => {
    const tpl = get().templates.find((t) => t.id === templateId);
    if (tpl) get().applyShelvesToSelection(tpl.cells);
  },

  addLayoutTemplate: (name) => {
    const s = get();
    const sel = s.activeFloor().modules.filter((m) => s.selection.includes(m.id));
    if (!sel.length) return "";
    // Габарит группы: смещения храним от его левого верхнего угла.
    const minX = Math.min(...sel.map((m) => m.x));
    const minY = Math.min(...sel.map((m) => m.y));
    const tpl: LayoutTemplate = {
      id: uid("lay"),
      name: name?.trim() || nameForLayout(sel),
      modules: sel.map((m) => ({
        type: m.type,
        dx: m.x - minX,
        dy: m.y - minY,
        w: m.w,
        h: m.h,
        rotation: m.rotation,
        realWidthCm: m.realWidthCm,
        realDepthCm: m.realDepthCm,
        realHeightCm: m.realHeightCm,
        shelves: m.shelves?.map((sh) => sh.cells),
      })),
    };
    set((st) => ({ layoutTemplates: [tpl, ...st.layoutTemplates] }));
    return tpl.id;
  },

  removeLayoutTemplate: (id) =>
    set((s) => ({
      layoutTemplates: s.layoutTemplates.filter((t) => t.id !== id),
      stampTemplateId: s.stampTemplateId === id ? null : s.stampTemplateId,
    })),

  setStampTemplate: (id) => set({ stampTemplateId: id }),

  stampLayoutTemplate: (id, at) => {
    const tpl = get().layoutTemplates.find((t) => t.id === id);
    if (!tpl) return;
    const mods: PlacedModule[] = tpl.modules.map((lm) => ({
      id: uid("mod"),
      type: lm.type,
      x: at.x + lm.dx,
      y: at.y + lm.dy,
      w: lm.w,
      h: lm.h,
      rotation: lm.rotation ?? 0,
      realWidthCm: lm.realWidthCm,
      realDepthCm: lm.realDepthCm,
      realHeightCm: lm.realHeightCm,
      shelves: lm.shelves?.map((cells) => ({ id: uid("shelf"), cells })),
    }));
    // Одним set — вся группа ставится и откатывается как единое действие.
    set((st) => mutateActiveFloor(st, (f) => f.modules.push(...mods)));
    set({ selection: mods.map((m) => m.id), activeShelf: null });
  },
});
