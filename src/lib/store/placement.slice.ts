import { addressKey } from "../address";
import { buildOccupancy, suggestCell } from "../placement";
import type { CellAddress } from "../types";
import type { PlacementSlice, SliceCreator } from "./state";

/**
 * Размещение товара по ячейкам и разрешение конфликта «на полке товар»
 * (ТЗ, разд. 3.6 и 4).
 */
export const createPlacementSlice: SliceCreator<PlacementSlice> = (set, get) => ({
  placements: {},
  pendingConflict: null,
  conflictResult: null,

  /**
   * Назначение товара на ячейку (ТЗ, разд. 3.6 — делается на экране «Таблица»).
   * Вытесняет прежнего жильца ячейки: инвариант «одна ячейка — один товар»
   * держится структурно, поэтому «разместить принудительно» — это просто вызов
   * без предварительной проверки. Решение о принуждении принимает UI (разд. 4).
   */
  placeProduct: (productId, addr) =>
    set((s) => {
      const key = addressKey(addr);
      const placements: Record<string, CellAddress> = {};
      for (const [pid, a] of Object.entries(s.placements)) {
        if (pid === productId) continue; // товар переезжает
        if (addressKey(a) === key) continue; // прежний жилец вытесняется
        placements[pid] = a;
      }
      placements[productId] = addr;
      return { placements };
    }),

  clearPlacement: (productId) =>
    set((s) => {
      if (!s.placements[productId]) return {};
      const placements = { ...s.placements };
      delete placements[productId];
      return { placements };
    }),

  /** Снять группу товаров с мест хранения, сами товары оставить. */
  clearPlacements: (ids) =>
    set((s) => {
      const placements = { ...s.placements };
      for (const id of ids) delete placements[id];
      return { placements };
    }),

  /**
   * Перенос товаров в свободные подходящие ячейки. Состояние читаем на каждой
   * итерации заново — иначе двое могли бы уехать в одну ячейку.
   */
  relocateProducts: (productIds) => {
    const failed: string[] = [];
    // Порядок размещения = порядок обхода ячеек, поэтому сортировка по
    // категории (а внутри — по артикулу) укладывает однотипный товар вплотную,
    // одним блоком: собирать заказ по одной зоне быстрее, чем по всему складу.
    const byId = new Map(get().products.map((p) => [p.id, p]));
    const ordered = [...productIds].sort((a, b) => {
      const pa = byId.get(a);
      const pb = byId.get(b);
      if (!pa || !pb) return 0;
      return (
        pa.category.localeCompare(pb.category, "ru") ||
        pa.sku.localeCompare(pb.sku, "ru")
      );
    });
    for (const id of ordered) {
      const s = get();
      const product = s.products.find((p) => p.id === id);
      if (!product) continue;
      const cell = suggestCell(
        s.warehouse,
        // Коробки приёмки тоже занимают ячейки — иначе перенос увёл бы товар
        // в место, где уже стоит принятая коробка (см. 2.1).
        buildOccupancy(s.placements, s.boxes),
        product,
        { preferFloorId: s.activeFloorId },
      );
      if (!cell) {
        failed.push(id);
        continue;
      }
      s.placeProduct(id, cell.addr);
    }
    return failed;
  },

  /**
   * Ответ на «на полке товар, как поступить?»: сначала снимаем товар с мест
   * (иначе адреса повиснут), затем выполняем саму правку плана, и только потом
   * — уже по новому плану — пробуем пристроить заново.
   */
  resolveConflict: (how) => {
    const conflict = get().pendingConflict;
    if (!conflict) return;

    set((s) => {
      const placements = { ...s.placements };
      for (const id of conflict.productIds) delete placements[id];
      return { placements, pendingConflict: null, conflictResult: null };
    });

    conflict.commit();

    if (how === "relocate") {
      const failed = get().relocateProducts(conflict.productIds);
      set({
        conflictResult: {
          moved: conflict.productIds.filter((id) => !failed.includes(id)),
          failed,
        },
      });
    }
  },

  cancelConflict: () => set({ pendingConflict: null, conflictResult: null }),
});
