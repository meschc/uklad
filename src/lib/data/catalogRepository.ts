import type { FieldType, Product, ProductCategory } from "../types";
import type { MsgKey } from "../i18n";
import { isProduct } from "./guards";
import { pickOne, readList, storePort, type Repository, type StorePort } from "./repository";
import { attempt, type Result } from "./result";

/**
 * Каталог (п.0.4): товары, категории и доп.поля через один вход.
 *
 * Категории живут здесь же, а не отдельным репозиторием: переименование
 * категории переписывает заодно товары и поля, и разведи это по двум входам —
 * сервер пришлось бы звать дважды там, где нужна одна транзакция.
 *
 * Отказ в имени («такая категория уже есть», «поле с таким именем занято») —
 * это ОТВЕТ, а не сбой: он приходит успехом с полезной нагрузкой, ровно как
 * «такой поставки нет» у приёмки. Провалом остаётся только то, что провалила
 * бы и сеть.
 */

/** Ответ на попытку завести доп.поле: имя может оказаться уже занятым. */
export interface FieldOutcome {
  ok: boolean;
  errorKey?: MsgKey;
  errorVars?: Record<string, string | number>;
}

export interface CatalogRepository extends Repository<Product> {
  create: (input: Omit<Product, "id">) => Promise<Result<string>>;
  update: (id: string, patch: Partial<Omit<Product, "id">>) => Promise<Result<void>>;
  remove: (ids: string[]) => Promise<Result<void>>;
  /** Загрузка из файла отдельным методом: сервер примет её одним запросом. */
  importMany: (items: Omit<Product, "id">[]) => Promise<Result<void>>;
  setCategory: (ids: string[], category: ProductCategory) => Promise<Result<void>>;
  setPartner: (ids: string[], partnerId: string | undefined) => Promise<Result<void>>;
  /**
   * Значения доп.полей одного товара пачкой: карточка отдаёт их разом при
   * сохранении, и запрос на каждое поле по отдельности был бы расточительством.
   */
  setFields: (productId: string, values: Record<string, string>) => Promise<Result<void>>;
  /** `false` — имя пустое или занято: это ответ, а не сбой. */
  addCategory: (name: string) => Promise<Result<boolean>>;
  renameCategory: (from: ProductCategory, to: string) => Promise<Result<boolean>>;
  removeCategory: (name: ProductCategory) => Promise<Result<void>>;
  addField: (
    category: ProductCategory,
    name: string,
    type: FieldType,
    options?: string[],
  ) => Promise<Result<FieldOutcome>>;
  removeField: (id: string) => Promise<Result<void>>;
  /** Поиск по артикулу/штрихкоду — то, что делает сканер на всех экранах. */
  findByCode: (code: string) => Promise<Result<Product | null>>;
}

export function createCatalogRepository(port: StorePort = storePort): CatalogRepository {
  const all = () => readList(() => port.get().products, isProduct, "products");

  return {
    list: all,
    get: (id) => pickOne(all, (p) => p.id === id),
    create: (input) => attempt(() => port.get().addProduct(input)),
    update: (id, patch) => attempt(() => port.get().updateProduct(id, patch)),
    remove: (ids) => attempt(() => port.get().deleteProducts(ids)),
    importMany: (items) => attempt(() => port.get().importProducts(items)),
    setCategory: (ids, category) => attempt(() => port.get().setProductsCategory(ids, category)),
    setPartner: (ids, partnerId) => attempt(() => port.get().setProductsPartner(ids, partnerId)),
    setFields: (productId, values) =>
      attempt(() => {
        const write = port.get().setFieldValue;
        for (const [fieldId, value] of Object.entries(values)) write(productId, fieldId, value);
      }),
    addCategory: (name) => attempt(() => port.get().addCategory(name)),
    renameCategory: (from, to) => attempt(() => port.get().renameCategory(from, to)),
    removeCategory: (name) => attempt(() => port.get().removeCategory(name)),
    addField: (category, name, type, options) =>
      attempt(() => port.get().addCategoryField(category, name, type, options)),
    removeField: (id) => attempt(() => port.get().removeCategoryField(id)),
    findByCode: async (code) => {
      const norm = code.trim().toLowerCase();
      if (!norm) return { ok: true, data: null };
      const res = await all();
      if (!res.ok) return res;
      // Сначала штрихкод: сканер отдаёт именно его, и совпадение по нему
      // надёжнее, чем по артикулу, который продавец мог задать как угодно.
      const found =
        res.data.find((p) => p.barcode.toLowerCase() === norm) ??
        res.data.find((p) => p.sku.toLowerCase() === norm) ??
        null;
      return { ok: true, data: found };
    },
  };
}

export const catalogRepository = createCatalogRepository();
