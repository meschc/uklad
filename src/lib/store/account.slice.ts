import type { Warehouse } from "../types";
import { systemTheme } from "../theme";
import type { AccountSlice, SliceCreator } from "./state";
import {
  blankWarehouse,
  seedAccount,
  seedWarehouse,
  seedWarehousePoor,
  seedWarehousePremium,
} from "./seed";

/**
 * Верхний уровень: аккаунт, профиль, список складов и навигация между экранами
 * кабинета (ТЗ, разд. 3.1–3.4).
 */
export const createAccountSlice: SliceCreator<AccountSlice> = (set, get) => ({
  warehouse: seedWarehouse(),
  // Три склада разного качества (п.8): активный — средний, класс B+, на нём
  // считается вся демо-история; рядом убитый класса C и образцовый A+.
  otherWarehouses: [seedWarehousePoor(), seedWarehousePremium()],
  appView: "dashboard",
  account: seedAccount(),
  profile: {
    name: "Кирилл",
    email: "kirill@uklad.ru",
    // Первый запуск открывается в теме устройства, дальше решает переключатель
    // в профиле — выбор человека persist держит и системой больше не
    // перебивает (почему именно так — в `lib/theme.ts`).
    theme: systemTheme(),
    language: "ru",
    showShelves: true,
  },

  allWarehouses: () => {
    const { warehouse, otherWarehouses } = get();
    return [warehouse, ...otherWarehouses];
  },

  goToDashboard: () => set({ appView: "dashboard" }),
  goToProfile: () => set({ appView: "profile" }),
  goToEditor: () => set({ appView: "editor" }),
  goToView: (view) => set({ appView: view }),
  goToLogin: () => set({ appView: "login", selection: [], activeShelf: null }),

  /**
   * Открыть склад. Активный всегда ровно один (ТЗ, разд. 3.4): выбранный
   * становится `warehouse`, прежний уходит в `otherWarehouses` (свап).
   */
  openWarehouse: (id) =>
    set((s) => {
      if (s.warehouse.id === id) return { appView: "editor" };
      const target = s.otherWarehouses.find((w) => w.id === id);
      if (!target) return { appView: "editor" };
      return {
        warehouse: target,
        otherWarehouses: s.otherWarehouses
          .filter((w) => w.id !== id)
          .concat(s.warehouse),
        activeFloorId: target.floors[0]?.id ?? "",
        appView: "editor",
        mode: "2d",
        selection: [],
        activeShelf: null,
        clipboard: [],
      };
    }),

  updateProfile: (patch) =>
    set((s) => {
      const profile = { ...s.profile, ...patch };
      // Имя не может быть пустым (ТЗ, п.8) — пустое игнорируем.
      if (patch.name !== undefined && !patch.name.trim()) {
        profile.name = s.profile.name;
      }
      return {
        profile,
        // Имя в профиле = имя пользователя; отражаем в шапке кабинета.
        account:
          patch.name && patch.name.trim()
            ? { ...s.account, name: patch.name }
            : s.account,
      };
    }),

  updateAccount: (patch) =>
    set((s) => ({ account: { ...s.account, ...patch } })),

  createWarehouse: (name, kind, address, coords) => {
    const wh = blankWarehouse(
      name.trim() || "Новый склад",
      kind,
      address.trim(),
      coords,
    );
    set((s) => ({ otherWarehouses: [...s.otherWarehouses, wh] }));
    return wh.id;
  },

  updateWarehouse: (id, patch) =>
    set((s) => {
      const apply = (w: Warehouse): Warehouse => ({
        ...w,
        name: patch.name != null ? patch.name.trim() || w.name : w.name,
        kind: patch.kind ?? w.kind,
        address: patch.address != null ? patch.address.trim() : w.address,
        lat: patch.lat !== undefined ? patch.lat : w.lat,
        lng: patch.lng !== undefined ? patch.lng : w.lng,
        // Тариф хранения снимается пустым полем, поэтому смотрим на НАЛИЧИЕ
        // ключа, а не на значение: иначе «стереть тариф» было бы невозможно, а
        // переименование склада из другого места молча его затирало бы.
        storageRatePerCell:
          "storageRatePerCell" in patch
            ? patch.storageRatePerCell
            : w.storageRatePerCell,
      });
      if (s.warehouse.id === id) return { warehouse: apply(s.warehouse) };
      return {
        otherWarehouses: s.otherWarehouses.map((w) =>
          w.id === id ? apply(w) : w,
        ),
      };
    }),

  deleteWarehouse: (id) =>
    set((s) => {
      if (1 + s.otherWarehouses.length <= 1) return {}; // последний не удаляем
      const target =
        s.warehouse.id === id
          ? s.warehouse
          : s.otherWarehouses.find((w) => w.id === id);
      if (!target) return {};
      // Размещения товаров на этажах удаляемого склада — очищаем (ТЗ, разд. 4).
      const floorIds = new Set(target.floors.map((f) => f.id));
      const placements = { ...s.placements };
      for (const [pid, a] of Object.entries(placements)) {
        if (floorIds.has(a.floorId)) delete placements[pid];
      }
      if (s.warehouse.id === id) {
        // Удалили активный — активным делаем первый из оставшихся.
        const [next, ...rest] = s.otherWarehouses;
        return {
          warehouse: next,
          otherWarehouses: rest,
          activeFloorId: next.floors[0]?.id ?? "",
          placements,
          selection: [],
          activeShelf: null,
          clipboard: [],
        };
      }
      return {
        otherWarehouses: s.otherWarehouses.filter((w) => w.id !== id),
        placements,
      };
    }),
});
