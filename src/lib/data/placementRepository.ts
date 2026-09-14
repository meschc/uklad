import { buildOccupancy, type Occupancy } from "../placement";
import { isCellAddress } from "./guards";
import { storePort, type StorePort } from "./repository";
import { attempt, type Result } from "./result";
import type { CellAddress } from "../types";

/**
 * Размещения товара (п.0.4). Занятость отдаётся ТОЛЬКО через общий
 * `buildOccupancy` — второй версии расчёта в проекте быть не должно, иначе
 * ячейка на тепловой карте и ячейка в диалоге размещения разойдутся молча.
 */
export interface PlacementRepository {
  list: () => Promise<Result<Record<string, CellAddress>>>;
  get: (productId: string) => Promise<Result<CellAddress | null>>;
  place: (productId: string, addr: CellAddress) => Promise<Result<void>>;
  clear: (productIds: string[]) => Promise<Result<void>>;
  /**
   * Пристроить товары в свободные подходящие ячейки. Отдаёт список тех, кому
   * места не нашлось: это ОТВЕТ, а не сбой, — ровно как «такой поставки нет» у
   * приёмки. Показать вместо разбора «проверьте связь» значило бы соврать.
   */
  relocate: (productIds: string[]) => Promise<Result<string[]>>;
  /** Занятость с учётом обоих путей хранения: прямо в ячейке и внутри тары. */
  occupancy: () => Promise<Result<Occupancy>>;
}

export function createPlacementRepository(port: StorePort = storePort): PlacementRepository {
  const map = () =>
    attempt(() => {
      const raw = port.get().placements ?? {};
      const out: Record<string, CellAddress> = {};
      let bad = 0;
      for (const [productId, addr] of Object.entries(raw)) {
        if (isCellAddress(addr)) out[productId] = addr;
        else bad++;
      }
      if (bad > 0) console.warn(`[uklad] placements: битых адресов — ${bad}`);
      return out;
    });

  return {
    list: map,
    get: async (productId) => {
      const res = await map();
      return res.ok ? { ok: true, data: res.data[productId] ?? null } : res;
    },
    place: (productId, addr) => attempt(() => port.get().placeProduct(productId, addr)),
    clear: (productIds) => attempt(() => port.get().clearPlacements(productIds)),
    relocate: (productIds) => attempt(() => port.get().relocateProducts(productIds)),
    occupancy: async () => {
      const res = await map();
      return res.ok ? { ok: true, data: buildOccupancy(res.data, port.get().boxes) } : res;
    },
  };
}

export const placementRepository = createPlacementRepository();
