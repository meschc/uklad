import { clamp } from "../utils";
import type { Floor } from "../types";
import type { FloorsSlice, SliceCreator } from "./state";
import { FLOOR_MAX, cloneFloor, goodsAt, renumberFloors, resolveFloor } from "./helpers";

/**
 * Этажи и тиражирование (ТЗ, разд. 3.5). Связанный этаж («алиас») зеркалит
 * раскладку первого: правки идут в источник, все алиасы обновляются разом.
 */
export const createFloorsSlice: SliceCreator<FloorsSlice> = (set, get) => ({
  activeFloorId: "",

  activeFloor: () => {
    const { warehouse, activeFloorId } = get();
    const base = warehouse.floors.find((f) => f.id === activeFloorId) ?? warehouse.floors[0];
    // Связанный этаж показывает раскладку источника (алиас первого этажа).
    return resolveFloor(warehouse, base);
  },

  // Выделение всегда сбрасываем: id модулей принадлежат другому этажу.
  // Выбрать можно любой этаж, включая связанный: его раскладку отдаёт
  // `activeFloor()` через `resolveFloor`, а правки всё равно уходят в источник.
  setActiveFloor: (id) =>
    set(() => ({
      activeFloorId: id,
      selection: [],
      activeShelf: null,
    })),

  duplicateFloor: (id) => {
    const s = get();
    const idx = s.warehouse.floors.findIndex((f) => f.id === id);
    if (idx < 0 || s.warehouse.floors.length >= FLOOR_MAX) return "";
    const source = s.warehouse.floors[idx];
    // Новый этаж создаём СВЯЗАННЫМ с источником: типовой склад — это
    // одинаковые этажи, и правка раскладки должна идти сразу на все. Связь
    // разрывается вручную, когда этаж действительно должен зажить своей
    // жизнью. Алиас алиаса не делаем — ссылаемся на первоисточник.
    const copy: Floor = {
      ...cloneFloor(source),
      aliasOf: source.aliasOf ?? source.id,
      modules: [],
    };
    const floors = [...s.warehouse.floors];
    floors.splice(idx + 1, 0, copy);
    set({
      warehouse: { ...s.warehouse, floors: renumberFloors(floors) },
      activeFloorId: copy.id,
      selection: [],
      activeShelf: null,
    });
    return copy.id;
  },

  deleteFloor: (id) => {
    const s = get();
    const floor = s.warehouse.floors.find((f) => f.id === id);
    if (!floor || s.warehouse.floors.length <= 1) return;
    const doIt = () =>
      set((st) => {
        if (st.warehouse.floors.length <= 1) return {};
        const floors = renumberFloors(st.warehouse.floors.filter((f) => f.id !== id));
        return {
          warehouse: { ...st.warehouse, floors },
          activeFloorId: st.activeFloorId === id ? floors[0].id : st.activeFloorId,
          selection: [],
          activeShelf: null,
        };
      });
    const lost = goodsAt(s.placements, (a) => a.floorId === id);
    if (lost.length) {
      const n = s.warehouse.floors.findIndex((f) => f.id === id) + 1;
      set({
        pendingConflict: {
          titleKey: "conflict.reason.deleteFloor",
          titleVars: { n },
          productIds: lost,
          commit: doIt,
        },
      });
      return;
    }
    doIt();
  },

  moveFloor: (id, dir) =>
    set((s) => {
      const floors = [...s.warehouse.floors];
      const idx = floors.findIndex((f) => f.id === id);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= floors.length) return {};
      [floors[idx], floors[j]] = [floors[j], floors[idx]];
      // renumberFloors переименует «Этаж N» по новой позиции; связи (aliasOf)
      // держатся по id, поэтому переупорядочивание их не рвёт.
      return { warehouse: { ...s.warehouse, floors: renumberFloors(floors) } };
    }),

  setFloorNumber: (id, n) =>
    set((s) => ({
      warehouse: {
        ...s.warehouse,
        floors: s.warehouse.floors.map((f) =>
          f.id === id ? { ...f, number: n != null && n >= 1 ? Math.round(n) : undefined } : f,
        ),
      },
    })),

  setFloorPosition: (id, pos) =>
    set((s) => {
      const floors = [...s.warehouse.floors];
      const idx = floors.findIndex((f) => f.id === id);
      const target = clamp(Math.round(pos) - 1, 0, floors.length - 1);
      if (idx < 0 || idx === target) return {};
      const [f] = floors.splice(idx, 1);
      floors.splice(target, 0, f);
      return { warehouse: { ...s.warehouse, floors: renumberFloors(floors) } };
    }),

  /** Тиражирование: копии активного этажа, пока всего не станет totalCount. */
  replicateActiveFloor: (totalCount) =>
    set((s) => {
      const target = clamp(Math.round(totalCount), 1, FLOOR_MAX);
      const cur = s.warehouse.floors;
      if (target <= cur.length) return {};
      const src = cur.find((f) => f.id === s.activeFloorId) ?? cur[cur.length - 1];
      const added = Array.from({ length: target - cur.length }, () => cloneFloor(src));
      return {
        warehouse: {
          ...s.warehouse,
          floors: renumberFloors([...cur, ...added]),
        },
      };
    }),

  toggleFloorLink: (id) =>
    set((s) => {
      const floors = s.warehouse.floors;
      const idx = floors.findIndex((f) => f.id === id);
      if (idx <= 0) return {}; // первый этаж — сам «основной блок», не связываем
      const floor = floors[idx];
      const main = floors[0];

      let next: Floor;
      if (floor.aliasOf) {
        // Разрыв связи: материализуем независимую копию текущего зеркала.
        const src = floors.find((f) => f.id === floor.aliasOf) ?? main;
        const copy = cloneFloor(src);
        next = {
          ...floor,
          aliasOf: undefined,
          modules: copy.modules,
          rows: src.rows ? [...src.rows] : undefined,
        };
        get().showToast("toast.floorUnlinked", { n: idx + 1 });
      } else {
        // Связываем с первым этажом: этаж становится его зеркалом.
        next = { ...floor, aliasOf: main.id };
        get().showToast("toast.floorLinked", { n: idx + 1 });
      }
      const nextFloors = floors.map((f, i) => (i === idx ? next : f));
      return { warehouse: { ...s.warehouse, floors: nextFloors }, selection: [] };
    }),
});
