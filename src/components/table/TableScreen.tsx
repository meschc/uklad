import { useCallback, useMemo, useState } from "react";
import { PackageSearch } from "lucide-react";
import { type Product } from "@/lib/types";
import { selectRole, useEditor } from "@/lib/store";
import { stockByProduct } from "@/lib/fulfillment";
import { useT } from "@/lib/i18n";
import { EMPTY_ARRAY } from "@/lib/utils";
import { AssignDialog } from "./AssignDialog";
import { FieldConstructor } from "./FieldConstructor";
import { ImportDialog } from "./ImportDialog";
import { ProductDialog } from "./ProductDialog";
import { BarcodeModal } from "./BarcodeModal";
import { BulkBar, SellerBar, PlaceFailedAlert } from "./BulkBar";
import { PickListDialog } from "./PickListDialog";
import { RequestDialog } from "@/components/fulfillment/RequestDialog";
import { ProductRow } from "./ProductRow";
import { TableHead } from "./TableHead";
import { TableToolbar } from "./TableToolbar";
import { buildRows, filterAndSort, type SortKey, type TableFilter } from "./tableRows";
import { useRowPicking } from "./useRowPicking";

/**
 * Номенклатура склада: таблица «товар ↔ место хранения ↔ остаток» (ТЗ, 3.6).
 *
 * Экран держит состояние и открывает диалоги. Что показывать — считает
 * `tableRows`, кого отметили — помнит `useRowPicking`, как это выглядит —
 * знают `TableToolbar`, `TableHead` и `ProductRow`.
 */
export function TableScreen() {
  const warehouse = useEditor((s) => s.warehouse);
  const products = useEditor((s) => s.products);
  const placements = useEditor((s) => s.placements);
  const boxes = useEditor((s) => s.boxes);
  const t = useT();

  const categories = useEditor((s) => s.categories);
  // Продавец видит ту же номенклатуру, но ничего в ней не меняет (п.26).
  const readOnly = useEditor((s) => selectRole(s) === "seller");
  const partners = useEditor((s) => s.warehouse.partners ?? EMPTY_ARRAY);
  const partnerName = useCallback(
    (id?: string) => partners.find((p) => p.id === id)?.name ?? "",
    [partners],
  );

  // Запрос общий с экраном 3D: искать можно оттуда, показываем здесь (ТЗ, 3.6).
  // Поэтому он живёт в сторе, а остальные три условия — местные.
  const query = useEditor((s) => s.search);
  const setQuery = useEditor((s) => s.setSearch);
  const [ownFilter, setOwnFilter] = useState<Omit<TableFilter, "query">>({
    category: "all",
    partnerId: "all",
    place: "all",
  });
  const filter = useMemo<TableFilter>(() => ({ ...ownFilter, query }), [ownFilter, query]);
  const patchFilter = (patch: Partial<TableFilter>) => {
    if (patch.query !== undefined) setQuery(patch.query);
    setOwnFilter((prev) => ({
      category: patch.category ?? prev.category,
      partnerId: patch.partnerId ?? prev.partnerId,
      place: patch.place ?? prev.place,
    }));
  };

  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "sku", dir: 1 });
  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));

  /** Товар, которому назначаем ячейку (ТЗ, разд. 3.6). */
  const revealOnPlan = useEditor((s) => s.revealOnPlan);
  const [assign, setAssign] = useState<Product | null>(null);
  /** Открыт ли конструктор полей категории (ТЗ, разд. 3.8). */
  const [fieldsOpen, setFieldsOpen] = useState(false);
  /** Открыт ли импорт товаров (ТЗ, разд. 2.5). */
  const [importOpen, setImportOpen] = useState(false);
  const [barcodeModal, setBarcodeModal] = useState<string | null>(null);
  /** Карточка товара: null — закрыта, {product:null} — новый, {product} — правка. */
  const [productDialog, setProductDialog] = useState<{ product: Product | null } | null>(null);
  /** Товары, которым не нашлось места при групповом размещении (п.7). */
  const [placeFailed, setPlaceFailed] = useState<string[]>([]);
  /** Заявка на отгрузку из отмеченных строк — набор продавца (п.3, п.9). */
  const [requestIds, setRequestIds] = useState<string[] | null>(null);
  /** Лист сборки по отмеченным строкам — складская печать (п.5). */
  const [pickListIds, setPickListIds] = useState<string[] | null>(null);

  // Остаток считаем тем же способом, что тепловая карта и дашборд: товар
  // лежит либо напрямую в ячейке, либо в таре с адресом.
  const stock = useMemo(() => stockByProduct(placements, boxes), [placements, boxes]);
  const rows = useMemo(
    () => buildRows(products, placements, warehouse, stock),
    [products, placements, warehouse, stock],
  );
  const visible = useMemo(
    () => filterAndSort(rows, filter, sort, partnerName),
    [rows, filter, sort, partnerName],
  );
  const placedCount = rows.filter((r) => r.place).length;

  const visibleIds = useMemo(() => visible.map((r) => r.product.id), [visible]);
  const pick = useRowPicking(visibleIds);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-background">
      <TableToolbar
        filter={filter}
        onFilter={patchFilter}
        categories={categories}
        partners={partners}
        counts={{ shown: visible.length, total: products.length, placed: placedCount }}
        readOnly={readOnly}
        onAdd={() => setProductDialog({ product: null })}
        onImport={() => setImportOpen(true)}
        onFields={() => setFieldsOpen(true)}
      />

      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <TableHead
            allPicked={pick.allVisiblePicked}
            somePicked={pick.someVisiblePicked}
            onToggleAll={pick.toggleAllVisible}
            onSort={toggleSort}
          />
          <tbody>
            {visible.map((row) => (
              <ProductRow
                key={row.product.id}
                row={row}
                partner={partnerName(row.product.partnerId)}
                picked={pick.picked.has(row.product.id)}
                readOnly={readOnly}
                onPick={(e) => pick.toggle(row.product.id, e.shiftKey)}
                onReveal={() => revealOnPlan(placements[row.product.id])}
                onAssign={() => setAssign(row.product)}
                onEdit={() => setProductDialog({ product: row.product })}
                onBarcode={() => setBarcodeModal(row.product.barcode)}
                onRequest={() => setRequestIds([row.product.id])}
              />
            ))}
          </tbody>
        </table>

        {visible.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <PackageSearch className="size-5" />
            </div>
            <p className="text-sm font-medium">{t("table.notFound.title")}</p>
            <p className="max-w-xs text-xs text-muted-foreground">{t("table.notFound.hint")}</p>
          </div>
        )}
      </div>

      {pick.picked.size > 0 &&
        (readOnly ? (
          <SellerBar
            ids={[...pick.picked]}
            onRequest={() => setRequestIds([...pick.picked])}
            onDone={pick.clear}
          />
        ) : (
          <BulkBar
            ids={[...pick.picked]}
            onDone={pick.clear}
            onPlaceFailed={setPlaceFailed}
            onPickList={() => setPickListIds([...pick.picked])}
          />
        ))}

      {placeFailed.length > 0 && (
        <PlaceFailedAlert ids={placeFailed} onClose={() => setPlaceFailed([])} t={t} />
      )}

      {assign && <AssignDialog product={assign} onClose={() => setAssign(null)} />}
      {fieldsOpen && <FieldConstructor onClose={() => setFieldsOpen(false)} />}
      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} />}
      {barcodeModal !== null && (
        <BarcodeModal code={barcodeModal} onClose={() => setBarcodeModal(null)} />
      )}
      {productDialog && (
        <ProductDialog product={productDialog.product} onClose={() => setProductDialog(null)} />
      )}
      {/* Отметку не снимаем: лист напечатали — строки остались отмеченными,
          с ними обычно тут же делают что-то ещё. */}
      {pickListIds && <PickListDialog ids={pickListIds} onClose={() => setPickListIds(null)} />}
      {requestIds && (
        <RequestDialog
          productIds={requestIds}
          onClose={() => {
            setRequestIds(null);
            pick.clear();
          }}
        />
      )}
    </div>
  );
}
