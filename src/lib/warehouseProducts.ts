import { useMemo } from "react";
import type { Product, User, Warehouse } from "./types";
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

/**
 * Что из номенклатуры склада видит пользователь. Склад — всё. Продавец —
 * только товар, который склад закрепил за его партнёром; без привязки —
 * ничего, а не всё.
 */
export function visibleProducts(
  products: Product[],
  warehouse: Warehouse,
  user: Pick<User, "role" | "partnerId">,
): Product[] {
  const own = productsOfWarehouse(products, warehouse);
  if (user.role !== "seller") return own;
  return user.partnerId ? own.filter((p) => p.partnerId === user.partnerId) : [];
}

/** Товары активного склада для текущего пользователя, стабильны по ссылке. */
export function useWarehouseProducts(): Product[] {
  const products = useEditor((s) => s.products);
  const warehouse = useEditor((s) => s.warehouse);
  const role = useEditor((s) => s.session.user.role);
  const partnerId = useEditor((s) => s.session.user.partnerId);
  return useMemo(
    () => visibleProducts(products, warehouse, { role, partnerId }),
    [products, warehouse, role, partnerId],
  );
}
