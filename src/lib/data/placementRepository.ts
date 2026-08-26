import { buildOccupancy, type Occupancy } from "../placement";
import { isCellAddress } from "./guards";
import { storePort, type StorePort } from "./repository";
import type { CellAddress } from "../types";

/**
 * Размещения товара (п.0.4). Занятость отдаётся ТОЛЬКО через общий
 * `buildOccupancy` — второй версии расчёта в проекте быть не должно, иначе
 * ячейка на тепловой карте и ячейка в диалоге размещения разойдутся молча.
 */
export interface PlacementRepository {
  list: () => Promise<Record<string, CellAddress>>;
  get: (productId: string) => Promise<CellAddress | null>;
  place: (productId: string, addr: CellAddress) => Promise<void>;
  clear: (productIds: string[]) => Promise<void>;
  /** Занятость с учётом обоих путей хранения: прямо в ячейке и внутри тары. */
  occupancy: () => Promise<Occupancy>;
}

export function createPlacementRepository(
  port: StorePort = storePort,
): PlacementRepository {
  const map = async (): Promise<Record<string, CellAddress>> => {
    const raw = port.get().placements ?? {};
    const out: Record<string, CellAddress> = {};
    let bad = 0;
    for (const [productId, addr] of Object.entries(raw)) {
      if (isCellAddress(addr)) out[productId] = addr;
      else bad++;
    }
    if (bad > 0) console.warn(`[uklad] placements: битых адресов — ${bad}`);
    return out;
  };

  return {
    list: map,
    get: async (productId) => (await map())[productId] ?? null,
    place: async (productId, addr) => port.get().placeProduct(productId, addr),
    clear: async (productIds) => port.get().clearPlacements(productIds),
    occupancy: async () => buildOccupancy(await map(), port.get().boxes),
  };
}

export const placementRepository = createPlacementRepository();
