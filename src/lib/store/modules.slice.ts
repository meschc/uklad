import { MODULE_SPECS, type PlacedModule } from "../types";
import type { ModulesSlice, SliceCreator } from "./state";
import { clampSize, cloneModules, goodsAt, makeModule, mutateActiveFloor } from "./helpers";

/**
 * Модули на плане: постановка, правка геометрии, поворот, удаление, а также
 * инструмент/выделение и буфер обмена (копировать / вырезать / вставить).
 */

/** Счётчик каскада вставок: сдвиг растёт с каждой вставкой, сброс — при копировании. */
let pasteRun = 0;

export const createModulesSlice: SliceCreator<ModulesSlice> = (set, get) => ({
  tool: "select",
  selection: [],
  clipboard: [],
  pasteAnchor: null,

  setTool: (tool) => set({ tool }),

  // Выделение модуля — это тоже указание места вставки, поэтому старую точку
  // на пустом холсте гасим: две конкурирующие цели сбивали бы с толку.
  select: (ids) => set({ selection: ids, activeShelf: null, pasteAnchor: null }),

  /**
   * «Показать на плане»: из таблицы, задания или заявки — сразу к ячейке.
   * Раньше адрес был только текстом, и найти место глазами по номеру секции
   * приходилось вручную. Полку раскрываем, чтобы было видно саму ячейку.
   */
  revealOnPlan: (addr) => {
    const s = get();
    const floor = s.warehouse.floors.find((f) => f.id === addr.floorId);
    if (!floor) return false;
    const src = floor.aliasOf
      ? (s.warehouse.floors.find((f) => f.id === floor.aliasOf) ?? floor)
      : floor;
    if (!src.modules.some((m) => m.id === addr.moduleId)) return false;

    set({
      appView: "editor",
      mode: "2d",
      activeFloorId: floor.id,
      selection: [addr.moduleId],
      activeShelf: { moduleId: addr.moduleId, index: addr.shelfIndex },
      pasteAnchor: null,
    });
    return true;
  },

  toggleSelect: (id, additive) =>
    set((s) => {
      const base = { activeShelf: null, pasteAnchor: null };
      if (!additive) return { selection: [id], ...base };
      return s.selection.includes(id)
        ? { selection: s.selection.filter((x) => x !== id), ...base }
        : { selection: [...s.selection, id], ...base };
    }),

  clearSelection: () => set({ selection: [], activeShelf: null }),

  addModule: (type, x, y, size) => {
    const mod = makeModule(type, x, y, size);
    set((s) => mutateActiveFloor(s, (f) => f.modules.push(mod)));
    // Поставленный модуль не забирает выделение: инструмент остаётся активным,
    // можно ставить следующий без лишнего клика (п.14a).
    set({ activeShelf: null });
    return mod.id;
  },

  /**
   * Положить сразу несколько модулей одним шагом истории — для штампа шаблона
   * раскладки (#38). Одним `set`, а не циклом по `addModule`, чтобы вся группа
   * ставилась и откатывалась (Cmd+Z) как единое действие.
   */
  addModules: (specs) => {
    const mods = specs.map((sp) =>
      makeModule(sp.type, sp.x, sp.y, { w: sp.w, h: sp.h }),
    );
    if (!mods.length) return [];
    set((s) => mutateActiveFloor(s, (f) => f.modules.push(...mods)));
    set({ activeShelf: null });
    return mods.map((m) => m.id);
  },

  updateModule: (id, patch) =>
    set((s) =>
      mutateActiveFloor(s, (f) => {
        const m = f.modules.find((x) => x.id === id);
        if (m) Object.assign(m, patch);
      }),
    ),

  setModuleRect: (id, rect) =>
    set((s) =>
      mutateActiveFloor(s, (f) => {
        const m = f.modules.find((x) => x.id === id);
        if (!m) return;
        const { w, h } = clampSize(m.type, rect.w, rect.h);
        m.x = Math.round(rect.x);
        m.y = Math.round(rect.y);
        m.w = w;
        m.h = h;
      }),
    ),

  moveSelection: (dx, dy) =>
    set((s) =>
      mutateActiveFloor(s, (f) => {
        for (const m of f.modules) {
          if (s.selection.includes(m.id)) {
            m.x += dx;
            m.y += dy;
          }
        }
      }),
    ),

  rotateModule: (id) =>
    set((s) =>
      mutateActiveFloor(s, (f) => {
        const m = f.modules.find((x) => x.id === id);
        if (!m || MODULE_SPECS[m.type].fixed) return;
        m.rotation = ((m.rotation + 90) % 360) as PlacedModule["rotation"];
        const nw = m.h;
        const nh = m.w;
        m.w = nw;
        m.h = nh;
      }),
    ),

  rotateSelection: () => {
    const { selection, rotateModule } = get();
    selection.forEach((id) => rotateModule(id));
  },

  deleteSelection: () => {
    const s = get();
    if (!s.selection.length) return;
    const doIt = () =>
      set((st) =>
        mutateActiveFloor(
          st,
          (f) => {
            f.modules = f.modules.filter((m) => !s.selection.includes(m.id));
          },
          { selection: [], activeShelf: null },
        ),
      );
    const lost = goodsAt(s.placements, (a) => s.selection.includes(a.moduleId));
    if (lost.length) {
      const sections = s
        .activeFloor()
        .modules.filter(
          (m) => s.selection.includes(m.id) && m.type === "section",
        ).length;
      set({
        pendingConflict:
          sections === 1
            ? {
                titleKey: "conflict.reason.deleteSection",
                productIds: lost,
                commit: doIt,
              }
            : {
                titleKey: "conflict.reason.deleteSections",
                titleVars: { n: sections },
                productIds: lost,
                commit: doIt,
              },
      });
      return;
    }
    doIt();
  },

  /**
   * Копирование в буфер. Кладём снимок выделенных модулей (с их полками);
   * свежие id и сдвиг выдаём уже при вставке. Сбрасываем счётчик каскада.
   */
  copySelection: () => {
    const s = get();
    const sel = s
      .activeFloor()
      .modules.filter((m) => s.selection.includes(m.id));
    if (!sel.length) return;
    pasteRun = 0;
    set({
      clipboard: sel.map((m) => ({
        ...m,
        shelves: m.shelves?.map((sh) => ({ ...sh })),
      })),
    });
  },

  /** Вырезать = скопировать и удалить (с проверкой «на полке товар»). */
  cutSelection: () => {
    get().copySelection();
    get().deleteSelection();
  },

  /**
   * Вставка из буфера в активный этаж.
   *
   * С указанной клеткой `at` группа кладётся ровно туда: левый верхний угол
   * её габарита совмещается с целевой клеткой. Это основной сценарий —
   * пользователь копирует объект и явно показывает, куда его положить.
   *
   * Без `at` остаётся прежнее поведение: каскад со сдвигом, чтобы повторные
   * вставки не ложились друг на друга.
   */
  pasteClipboard: (at) => {
    const s = get();
    if (!s.clipboard.length) return;
    let clones: PlacedModule[];
    if (at) {
      const minX = Math.min(...s.clipboard.map((m) => m.x));
      const minY = Math.min(...s.clipboard.map((m) => m.y));
      clones = cloneModules(s.clipboard, at.x - minX, at.y - minY);
      pasteRun = 0;
    } else {
      pasteRun += 1;
      clones = cloneModules(s.clipboard, pasteRun, pasteRun);
    }
    set((st) => mutateActiveFloor(st, (f) => f.modules.push(...clones)));
    // Точку вставки гасим: она одноразовая, иначе следующий Cmd+V положил бы
    // копию туда же, поверх только что вставленной.
    set({
      selection: clones.map((m) => m.id),
      activeShelf: null,
      pasteAnchor: null,
    });
  },

  setPasteAnchor: (cell) => set({ pasteAnchor: cell }),

  /** Дублировать выделенное на месте (сдвиг на клетку). Буфер не трогаем. */
  duplicateSelection: () => {
    const s = get();
    const sel = s
      .activeFloor()
      .modules.filter((m) => s.selection.includes(m.id));
    if (!sel.length) return;
    const clones = cloneModules(sel, 1, 1);
    set((st) => mutateActiveFloor(st, (f) => f.modules.push(...clones)));
    set({ selection: clones.map((m) => m.id), activeShelf: null });
  },

  /**
   * Клонировать выделение БЕЗ сдвига и выделить копии. Для Alt/Cmd-перетаскивания:
   * копия ложится поверх оригинала, а сам перенос уводит её в сторону.
   */
  cloneSelectionInPlace: () => {
    const s = get();
    const sel = s
      .activeFloor()
      .modules.filter((m) => s.selection.includes(m.id));
    if (!sel.length) return [];
    const clones = cloneModules(sel, 0, 0);
    set((st) => mutateActiveFloor(st, (f) => f.modules.push(...clones)));
    const ids = clones.map((m) => m.id);
    set({ selection: ids, activeShelf: null });
    return ids;
  },
});
