import { useCallback, useMemo, useRef, useState } from "react";
import { ArrowUpDown, Barcode, Check, ExternalLink, MapPin, PackageSearch, Pencil, Plus, Search, Settings2, Truck, Upload, X } from "lucide-react";
import { type Product } from "@/lib/types";
import { selectRole, useEditor } from "@/lib/store";
import { cm, formatAddress } from "@/lib/address";
import { stockByProduct } from "@/lib/fulfillment";
import { catLabel, useT } from "@/lib/i18n";
import { cn, EMPTY_ARRAY } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Input } from "@/components/ui/input";
import { AssignDialog } from "./AssignDialog";
import { FieldConstructor } from "./FieldConstructor";
import { ImportDialog } from "./ImportDialog";
import { ProductDialog } from "./ProductDialog";
import { BarcodeModal } from "./BarcodeModal";
import { BulkBar, SellerBar, PlaceFailedAlert } from "./BulkBar";
import { PickListDialog } from "./PickListDialog";
import { RequestDialog } from "@/components/fulfillment/RequestDialog";

/** URL только с безопасной схемой (http/https), иначе ссылку не рисуем. */
function safeUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}

type SortKey =
  | "sku"
  | "name"
  | "category"
  | "partner"
  | "weight"
  | "qty"
  | "place";
type PlaceFilter = "all" | "placed" | "free";

/** Детерминированный оттенок из артикула — для демо-фото (ТЗ, разд. 2.5). */
function hueFromSku(sku: string): number {
  let h = 0;
  for (const ch of sku) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

/** Демо-фото товара: генерируется, внешних картинок нет. */
function ProductThumb({ product }: { product: Product }) {
  const t = useT();
  const h = hueFromSku(product.sku);
  // Настоящее фото важнее заглушки: если ссылка есть, показываем её (п.13).
  if (product.imageUrl) {
    return (
      <img
        src={product.imageUrl}
        alt=""
        loading="lazy"
        className="h-9 w-9 shrink-0 rounded-md border border-black/10 object-cover"
      />
    );
  }
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-black/10 text-[13px] font-semibold"
      style={{
        background: `linear-gradient(135deg, hsl(${h} 70% 88%), hsl(${(h + 45) % 360} 70% 74%))`,
        color: `hsl(${h} 55% 28%)`,
      }}
      title={t("table.photoTitle", { sku: product.sku })}
    >
      {product.name.charAt(0)}
    </div>
  );
}

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

  // Запрос общий со экраном 3D: искать можно оттуда, показываем здесь (ТЗ, 3.6).
  const query = useEditor((s) => s.search);
  const setQuery = useEditor((s) => s.setSearch);
  const [category, setCategory] = useState<string>("all");
  const [partnerId, setPartnerId] = useState<string>("all");
  const [placeFilter, setPlaceFilter] = useState<PlaceFilter>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({
    key: "sku",
    dir: 1,
  });
  /** Товар, которому назначаем ячейку (ТЗ, разд. 3.6). */
  const revealOnPlan = useEditor((s) => s.revealOnPlan);
  const [assign, setAssign] = useState<Product | null>(null);
  /** Открыт ли конструктор полей категории (ТЗ, разд. 3.8). */
  const [fieldsOpen, setFieldsOpen] = useState(false);
  /** Открыт ли импорт товаров (ТЗ, разд. 2.5). */
  const [importOpen, setImportOpen] = useState(false);
  const [barcodeModal, setBarcodeModal] = useState<string | null>(null);
  /** Карточка товара: null — закрыта, {product:null} — новый, {product} — правка. */
  const [productDialog, setProductDialog] = useState<{
    product: Product | null;
  } | null>(null);
  /** Отмеченные строки для групповых действий (#32). */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  /** Товары, которым не нашлось места при групповом размещении (п.7). */
  const [placeFailed, setPlaceFailed] = useState<string[]>([]);
  /** Заявка на отгрузку из отмеченных строк — набор продавца (п.3, п.9). */
  const [requestIds, setRequestIds] = useState<string[] | null>(null);
  /** Лист сборки по отмеченным строкам — складская печать (п.5). */
  const [pickListIds, setPickListIds] = useState<string[] | null>(null);
  /** Последняя отмеченная строка — от неё Shift тянет диапазон. */
  const lastPicked = useRef<string | null>(null);

  // Остаток считаем тем же способом, что тепловая карта и дашборд: товар
  // лежит либо напрямую в ячейке, либо в таре с адресом.
  const stock = useMemo(
    () => stockByProduct(placements, boxes),
    [placements, boxes],
  );

  // Строка «товар ↔ место хранения ↔ остаток» (ТЗ, разд. 3.6).
  const rows = useMemo(() => {
    return products.map((p) => {
      const addr = placements[p.id];
      const place = addr ? formatAddress(warehouse, addr) : null;
      return { product: p, place, qty: stock.get(p.id)?.qty ?? 0 };
    });
  }, [products, placements, warehouse, stock]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter(({ product: p, place }) => {
      if (category !== "all" && p.category !== category) return false;
      if (partnerId !== "all" && (p.partnerId ?? "") !== partnerId) return false;
      if (placeFilter === "placed" && !place) return false;
      if (placeFilter === "free" && place) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (place ?? "").includes(q)
      );
    });
    const cmpStr = (a: string, b: string) => a.localeCompare(b, "ru");
    return [...filtered].sort((a, b) => {
      const d = sort.dir;
      switch (sort.key) {
        case "sku":
          return d * cmpStr(a.product.sku, b.product.sku);
        case "name":
          return d * cmpStr(a.product.name, b.product.name);
        case "category":
          return d * cmpStr(a.product.category, b.product.category);
        case "partner":
          return d * cmpStr(
            partnerName(a.product.partnerId),
            partnerName(b.product.partnerId),
          );
        case "weight":
          return d * ((a.product.weightKg ?? 0) - (b.product.weightKg ?? 0));
        case "qty":
          return d * (a.qty - b.qty);
        case "place":
          // Неразмещённые — всегда в конце, независимо от направления.
          if (!a.place && !b.place) return 0;
          if (!a.place) return 1;
          if (!b.place) return -1;
          return d * cmpStr(a.place, b.place);
      }
    });
  }, [rows, query, category, partnerId, placeFilter, sort, partnerName]);

  const placedCount = rows.filter((r) => r.place).length;

  // Групповое выделение живёт поверх фильтров: «выделить всё» берёт только
  // видимые строки, а отметки скрытых фильтром товаров не теряются.
  const visibleIds = useMemo(
    () => visible.map((r) => r.product.id),
    [visible],
  );
  const pickedVisible = visibleIds.filter((id) => picked.has(id));
  const allVisiblePicked =
    visibleIds.length > 0 && pickedVisible.length === visibleIds.length;

  /**
   * Отметка строки. С Shift — диапазон от предыдущей отмеченной до текущей, как
   * в любой таблице и как выделение рядов на плане (п.3). Диапазон всегда
   * добавляет: Shift «дотягивает» выделение, а не переключает каждую строку.
   */
  const togglePicked = (id: string, range = false) => {
    // Якорь читаем ДО setPicked: обновление состояния выполняется в рендере,
    // а к тому моменту ref уже указывал бы на текущую строку — и диапазон
    // схлопывался бы в обычный клик.
    const from = lastPicked.current;
    lastPicked.current = id;
    setPicked((prev) => {
      const next = new Set(prev);
      if (range && from && from !== id) {
        const a = visibleIds.indexOf(from);
        const b = visibleIds.indexOf(id);
        if (a >= 0 && b >= 0) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          for (let i = lo; i <= hi; i++) next.add(visibleIds[i]);
          return next;
        }
      }
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (allVisiblePicked) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));

  const filters: { id: PlaceFilter; key: string }[] = [
    { id: "all", key: "table.filter.all" },
    { id: "placed", key: "table.filter.placed" },
    { id: "free", key: "table.filter.free" },
  ];

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-background">
      {/* Панель поиска и фильтров */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("table.search")}
            className="h-8 w-72 pl-8 pr-7"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              // Внутри поля: rounded-md (8) − отступ 4 = 4 → DEFAULT.
              className="absolute right-1 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground"
              title={t("table.clear")}
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="all">{t("table.allCategories")}</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {catLabel(t, c)}
            </option>
          ))}
        </select>

        {/* Партнёры — отдельный фильтр: на складе лежит товар нескольких
            продавцов, и разбирать его надо по одному партнёру (п.15). */}
        {partners.length > 0 && (
          <select
            value={partnerId}
            onChange={(e) => setPartnerId(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="all">{t("table.allPartners")}</option>
            <option value="">{t("product.partnerNone")}</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}

        <Segmented
          value={placeFilter}
          onChange={setPlaceFilter}
          options={filters.map((f) => ({ value: f.id, label: t(f.key) }))}
        />

        {!readOnly && (
          <>
            <Button
              size="sm"
              className="ml-auto"
              onClick={() => setProductDialog({ product: null })}
            >
              <Plus className="size-3.5" />
              {t("table.addProduct")}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setImportOpen(true)}
            >
              <Upload className="size-3.5" />
              {t("table.import")}
            </Button>

            <Button variant="outline" size="sm" onClick={() => setFieldsOpen(true)}>
              <Settings2 className="size-3.5" />
              {t("table.fields")}
            </Button>
          </>
        )}

        <div className="text-xs text-muted-foreground">
          {t("table.shownOf", {
            n: visible.length,
            total: products.length,
            placed: placedCount,
          })}
        </div>
      </div>

      {/* Таблица «товар ↔ место хранения» */}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="border-b border-border text-left">
              <Th className="w-9">
                <RowCheck
                  checked={allVisiblePicked}
                  partial={pickedVisible.length > 0 && !allVisiblePicked}
                  onChange={toggleAllVisible}
                  label={t("table.bulk.selectAll")}
                />
              </Th>
              <Th className="w-12">{t("table.col.photo")}</Th>
              <Th sortable onClick={() => toggleSort("sku")}>
                {t("table.col.sku")}
              </Th>
              <Th sortable onClick={() => toggleSort("name")}>
                {t("table.col.name")}
              </Th>
              <Th>{t("table.col.barcode")}</Th>
              <Th sortable onClick={() => toggleSort("category")}>
                {t("table.col.category")}
              </Th>
              <Th sortable onClick={() => toggleSort("partner")}>
                {t("table.col.partner")}
              </Th>
              <Th>{t("table.col.dims")}</Th>
              <Th sortable onClick={() => toggleSort("weight")}>
                {t("table.col.weight")}
              </Th>
              <Th sortable onClick={() => toggleSort("qty")}>
                {t("table.col.qty")}
              </Th>
              <Th sortable onClick={() => toggleSort("place")}>
                {t("table.col.place")}
              </Th>
              <Th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {visible.map(({ product: p, place, qty }) => (
              <tr
                key={p.id}
                className={cn(
                  "group/row border-b border-border/60 transition-colors hover:bg-accent/40",
                  picked.has(p.id) && "bg-primary/5",
                )}
              >
                <td className="px-3 py-1.5">
                  <RowCheck
                    checked={picked.has(p.id)}
                    onChange={(e) => togglePicked(p.id, e.shiftKey)}
                    label={p.name}
                    title={t("table.bulk.shiftHint")}
                  />
                </td>
                <td className="px-3 py-1.5">
                  <ProductThumb product={p} />
                </td>
                <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">
                  {p.sku}
                </td>
                <td className="px-3 py-1.5 font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    {p.name}
                    {safeUrl(p.url) && (
                      <a
                        href={safeUrl(p.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title={t("table.openUrl")}
                        className="text-muted-foreground/50 transition-colors hover:text-primary"
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                    )}
                  </span>
                </td>
                <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => setBarcodeModal(p.barcode)}
                    title={t("table.showBarcode")}
                    className="group/bc inline-flex items-center gap-1.5 rounded transition-colors hover:text-foreground"
                  >
                    {p.barcode}
                    <Barcode className="size-3.5 opacity-0 transition-opacity group-hover/row:opacity-50 group-hover/bc:opacity-100" />
                  </button>
                </td>
                <td className="px-3 py-1.5">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                    {catLabel(t, p.category)}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-xs text-muted-foreground">
                  {partnerName(p.partnerId) || "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-muted-foreground">
                  {cm(p.widthCm)} × {cm(p.heightCm)} × {cm(p.depthCm)}
                </td>
                <td className="px-3 py-1.5 tabular-nums text-muted-foreground">
                  {p.weightKg != null ? cm(p.weightKg) : "—"}
                </td>
                <td
                  className={cn(
                    "px-3 py-1.5 tabular-nums",
                    qty > 0 ? "font-medium" : "text-muted-foreground",
                  )}
                >
                  {qty}
                </td>
                <td className="px-3 py-1.5">
                  {readOnly ? (
                    place ? (
                      /* Продавцу адрес нужен не как текст, а как место: клик
                         открывает план на нужной секции с раскрытой полкой. */
                      <button
                        onClick={() => revealOnPlan(placements[p.id])}
                        title={t("table.showOnPlan")}
                        className="group/place inline-flex items-center gap-1"
                      >
                        <AddressChip address={place} />
                        <MapPin className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover/place:opacity-100" />
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )
                  ) : place ? (
                    <span className="group/place inline-flex items-center gap-1">
                      {/* Клик по адресу — «показать на плане», карандаш —
                          сменить место: разные намерения, разные цели. */}
                      <button
                        onClick={() => revealOnPlan(placements[p.id])}
                        title={t("table.showOnPlan")}
                      >
                        <AddressChip address={place} />
                      </button>
                      <button
                        onClick={() => setAssign(p)}
                        title={t("table.editPlace")}
                        className="opacity-0 transition-opacity group-hover/place:opacity-100"
                      >
                        <Pencil className="size-3 text-muted-foreground" />
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setAssign(p)}
                      className="inline-flex items-center gap-1 rounded border border-dashed border-border px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
                    >
                      <MapPin className="size-3" />
                      {t("table.assignBtn")}
                    </button>
                  )}
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center justify-end gap-1">
                    {/* Продавцу из таблицы нужна ровно одна операция — набрать
                        заявку на отгрузку (п.3). */}
                    {readOnly && (
                      <button
                        onClick={() => setRequestIds([p.id])}
                        title={t("seller.request")}
                        className="flex size-7 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-accent hover:text-primary group-hover/row:text-muted-foreground"
                      >
                        <Truck className="size-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => setProductDialog({ product: p })}
                      title={t("table.editProduct")}
                      className="flex size-7 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground group-hover/row:text-muted-foreground"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {visible.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <PackageSearch className="size-5" />
            </div>
            <p className="text-sm font-medium">{t("table.notFound.title")}</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              {t("table.notFound.hint")}
            </p>
          </div>
        )}
      </div>

      {picked.size > 0 &&
        (readOnly ? (
          <SellerBar
            ids={[...picked]}
            onRequest={() => setRequestIds([...picked])}
            onDone={() => setPicked(new Set())}
          />
        ) : (
          <BulkBar
            ids={[...picked]}
            onDone={() => setPicked(new Set())}
            onPlaceFailed={setPlaceFailed}
            onPickList={() => setPickListIds([...picked])}
          />
        ))}

      {placeFailed.length > 0 && (
        <PlaceFailedAlert
          ids={placeFailed}
          onClose={() => setPlaceFailed([])}
          t={t}
        />
      )}

      {assign && (
        <AssignDialog product={assign} onClose={() => setAssign(null)} />
      )}
      {fieldsOpen && <FieldConstructor onClose={() => setFieldsOpen(false)} />}
      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} />}
      {barcodeModal !== null && (
        <BarcodeModal
          code={barcodeModal}
          onClose={() => setBarcodeModal(null)}
        />
      )}
      {productDialog && (
        <ProductDialog
          product={productDialog.product}
          onClose={() => setProductDialog(null)}
        />
      )}
      {/* Отметку не снимаем: лист напечатали — строки остались отмеченными,
          с ними обычно тут же делают что-то ещё. */}
      {pickListIds && (
        <PickListDialog ids={pickListIds} onClose={() => setPickListIds(null)} />
      )}
      {requestIds && (
        <RequestDialog
          productIds={requestIds}
          onClose={() => {
            setRequestIds(null);
            setPicked(new Set());
          }}
        />
      )}
    </div>
  );
}

/**
 * Чекбокс строки. Свой, а не нативный: нативный `indeterminate` ставится
 * только из JS, а в шапке нужно именно третье состояние «часть отмечена».
 */
function RowCheck({
  checked,
  partial,
  onChange,
  label,
  title,
}: {
  checked: boolean;
  partial?: boolean;
  /** Событие нужно целиком: Shift тянет диапазон строк. */
  onChange: (e: React.MouseEvent) => void;
  label: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={partial ? "mixed" : checked}
      aria-label={label}
      title={title}
      onClick={onChange}
      className={cn(
        "flex size-4 items-center justify-center rounded border transition-colors",
        checked || partial
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input hover:border-primary/60",
      )}
    >
      {partial ? (
        <span className="h-0.5 w-2 rounded-full bg-current" />
      ) : checked ? (
        <Check className="size-3" />
      ) : null}
    </button>
  );
}

/** Адрес: этаж-секция-полка-ячейка. */
function AddressChip({ address }: { address: string }) {
  const t = useT();
  const [f, s, sh, c] = address.split("-");
  return (
    <span
      className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-medium text-primary"
      title={t("table.addrTitle", { f, s, sh, c })}
    >
      {address}
    </span>
  );
}

function Th({
  children,
  className,
  sortable,
  onClick,
}: {
  children?: React.ReactNode;
  className?: string;
  sortable?: boolean;
  onClick?: () => void;
}) {
  return (
    <th
      className={cn(
        "whitespace-nowrap px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
        sortable && "cursor-pointer select-none hover:text-foreground",
        className,
      )}
      onClick={onClick}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sortable && <ArrowUpDown className="size-3 opacity-40" />}
      </span>
    </th>
  );
}
