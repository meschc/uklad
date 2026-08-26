import type { Product } from "../types";
import { isProduct } from "./guards";
import { readList, storePort, type Repository, type StorePort } from "./repository";

/** Номенклатура: чтение и правка товаров через один вход (п.0.4). */
export interface ProductsRepository extends Repository<Product> {
  create: (input: Omit<Product, "id">) => Promise<string>;
  update: (id: string, patch: Partial<Omit<Product, "id">>) => Promise<void>;
  remove: (ids: string[]) => Promise<void>;
  /** Поиск по артикулу/штрихкоду — то, что делает сканер на всех экранах. */
  findByCode: (code: string) => Promise<Product | null>;
}

export function createProductsRepository(
  port: StorePort = storePort,
): ProductsRepository {
  const all = () => readList(() => port.get().products, isProduct, "products");

  return {
    list: all,
    get: async (id) => (await all()).find((p) => p.id === id) ?? null,
    create: async (input) => port.get().addProduct(input),
    update: async (id, patch) => port.get().updateProduct(id, patch),
    remove: async (ids) => port.get().deleteProducts(ids),
    findByCode: async (code) => {
      const norm = code.trim().toLowerCase();
      if (!norm) return null;
      const items = await all();
      return (
        items.find((p) => p.barcode.toLowerCase() === norm) ??
        items.find((p) => p.sku.toLowerCase() === norm) ??
        null
      );
    },
  };
}

export const productsRepository = createProductsRepository();
