import { useMemo } from "react";
import type { Product, Warehouse } from "./types";
import { useEditor } from "./store";

/**
 * Номенклатура одного склада. Товар со своим `warehouseId` живёт только на
 * нём; товар без поля — общий демо-каталог, его видят склады без своего
 * каталога. Поэтому новый склад начинается пустым, а демо-склады — как были.
 */
export function productsOfWarehouse(products: Product[], warehouse: Warehouse): Product[] {
  return products.filter((p) =>
    p.warehouseId ? p.warehouseId === warehouse.id : !warehouse.ownCatalog,
  );
}

/** Товары активного склада — стабильны по ссылке, пока не сменились входы. */
export function useWarehouseProducts(): Product[] {
  const products = useEditor((s) => s.products);
  const warehouse = useEditor((s) => s.warehouse);
  return useMemo(() => productsOfWarehouse(products, warehouse), [products, warehouse]);
}
