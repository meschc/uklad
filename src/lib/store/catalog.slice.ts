import { uid } from "../utils";
import { fieldValueKey } from "./helpers";
import type { CatalogSlice, SliceCreator } from "./state";
import { PRODUCT_CATEGORIES } from "../types";
import { seedCategoryFields, seedProducts } from "./seed";

/**
 * Номенклатура и конструктор доп.полей категорий (ТЗ, разд. 2.5, 3.8).
 * Групповые операции делаются одним `set`, а не циклом по одиночным действиям:
 * иначе на каждый товар ложится свой снимок истории и отмена откатывала бы
 * группу по одному (#32).
 */
export const createCatalogSlice: SliceCreator<CatalogSlice> = (set, get) => ({
  products: seedProducts(),
  search: "",
  categories: [...PRODUCT_CATEGORIES],
  categoryFields: seedCategoryFields(),
  fieldValues: {},

  setSearch: (q) => set({ search: q }),

  searchInTable: (q) => set({ search: q, mode: "table" }),

  addCategoryField: (category, name, type, options) => {
    const clean = name.trim();
    if (!clean) return { ok: false, errorKey: "fields.err.empty" };
    // Уникальность имени в пределах категории (ТЗ, разд. 4).
    const dup = get().categoryFields.some(
      (f) => f.category === category && f.name.trim().toLowerCase() === clean.toLowerCase(),
    );
    if (dup) {
      return { ok: false, errorKey: "fields.err.dup", errorVars: { name: clean } };
    }
    const opts =
      type === "select" ? (options ?? []).map((o) => o.trim()).filter(Boolean) : undefined;
    if (type === "select" && (!opts || opts.length < 1)) {
      return { ok: false, errorKey: "fields.err.needOption" };
    }
    set((s) => ({
      categoryFields: [
        ...s.categoryFields,
        { id: uid("fld"), category, name: clean, type, options: opts },
      ],
    }));
    return { ok: true };
  },

  removeCategoryField: (id) =>
    set((s) => {
      const fieldValues = { ...s.fieldValues };
      // Значения этого поля во всех товарах — тоже удаляем (о чём и предупреждаем).
      for (const key of Object.keys(fieldValues)) {
        if (key.endsWith(`:${id}`)) delete fieldValues[key];
      }
      return {
        categoryFields: s.categoryFields.filter((f) => f.id !== id),
        fieldValues,
      };
    }),

  setFieldValue: (productId, fieldId, value) =>
    set((s) => {
      const key = fieldValueKey(productId, fieldId);
      const fieldValues = { ...s.fieldValues };
      if (value.trim() === "") delete fieldValues[key];
      else fieldValues[key] = value;
      return { fieldValues };
    }),

  addProduct: (p) => {
    const id = uid("prod");
    set((s) => ({ products: [...s.products, { ...p, id }] }));
    return id;
  },

  updateProduct: (id, patch) =>
    set((s) => ({
      products: s.products.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    })),

  deleteProducts: (ids) =>
    set((s) => {
      const kill = new Set(ids);
      const placements = { ...s.placements };
      const fieldValues = { ...s.fieldValues };
      for (const id of kill) {
        delete placements[id];
        for (const k of Object.keys(fieldValues)) {
          if (k.startsWith(`${id}:`)) delete fieldValues[k];
        }
      }
      return {
        products: s.products.filter((p) => !kill.has(p.id)),
        placements,
        fieldValues,
      };
    }),

  /** Сменить категорию у группы товаров. */
  setProductsCategory: (ids, category) =>
    set((s) => {
      const hit = new Set(ids);
      return {
        products: s.products.map((p) => (hit.has(p.id) ? { ...p, category } : p)),
      };
    }),

  setProductsPartner: (ids, partnerId) =>
    set((s) => {
      const hit = new Set(ids);
      return {
        products: s.products.map((p) => (hit.has(p.id) ? { ...p, partnerId } : p)),
      };
    }),

  addCategory: (name) => {
    const clean = name.trim();
    if (!clean) return false;
    const exists = get().categories.some((c) => c.toLowerCase() === clean.toLowerCase());
    if (exists) return false;
    set((s) => ({ categories: [...s.categories, clean] }));
    return true;
  },

  renameCategory: (from, to) => {
    const clean = to.trim();
    if (!clean || clean === from) return false;
    const taken = get().categories.some(
      (c) => c !== from && c.toLowerCase() === clean.toLowerCase(),
    );
    if (taken) return false;
    // Переименование тянет за собой товары и доп.поля: категория — это ключ
    // связи, а не подпись, и рассинхрон оставил бы поля висеть в пустоте.
    set((s) => ({
      categories: s.categories.map((c) => (c === from ? clean : c)),
      products: s.products.map((p) => (p.category === from ? { ...p, category: clean } : p)),
      categoryFields: s.categoryFields.map((f) =>
        f.category === from ? { ...f, category: clean } : f,
      ),
    }));
    return true;
  },

  removeCategory: (name) => {
    const rest = get().categories.filter((c) => c !== name);
    // Последнюю категорию не удаляем: товару всегда нужна какая-то категория.
    if (!rest.length) return;
    const fallback = rest[0];
    set((s) => ({
      categories: rest,
      products: s.products.map((p) => (p.category === name ? { ...p, category: fallback } : p)),
      categoryFields: s.categoryFields.filter((f) => f.category !== name),
    }));
  },

  importProducts: (items) =>
    set((s) => ({
      products: [...s.products, ...items.map((p) => ({ ...p, id: uid("prod") }))],
    })),
});
