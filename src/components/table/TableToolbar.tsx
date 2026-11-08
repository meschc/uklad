import { useState } from "react";
import { Download, Plus, Search, Settings2, SlidersHorizontal, X } from "lucide-react";
import { catLabel, useT, type MsgKey } from "@/lib/i18n";
import type { Partner } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import type { PlaceFilter, TableFilter } from "./tableRows";

const PLACE_FILTERS: { id: PlaceFilter; key: MsgKey }[] = [
  { id: "all", key: "table.filter.all" },
  { id: "placed", key: "table.filter.placed" },
  { id: "free", key: "table.filter.free" },
];

/**
 * Панель поиска и фильтров. Меняет фильтр целиком — заплаткой, а не набором
 * отдельных колбэков: панель и так знает про все четыре условия сразу, а экрану
 * важно одно — «фильтр стал вот таким».
 */
export function TableToolbar({
  filter,
  onFilter,
  categories,
  partners,
  counts,
  readOnly,
  onAdd,
  onImport,
  onFields,
}: {
  filter: TableFilter;
  onFilter: (patch: Partial<TableFilter>) => void;
  categories: readonly string[];
  partners: readonly Partner[];
  counts: { shown: number; total: number; placed: number };
  readOnly: boolean;
  onAdd: () => void;
  onImport: () => void;
  onFields: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const active =
    (filter.category !== "all" ? 1 : 0) +
    (filter.partnerId !== "all" ? 1 : 0) +
    (filter.place !== "all" ? 1 : 0);
  return (
    <div className="flex shrink-0 flex-col border-b border-border bg-card">
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter.query}
            onChange={(e) => onFilter({ query: e.target.value })}
            placeholder={t("table.search")}
            className="h-8 w-56 pl-8 pr-7"
          />
          {filter.query && (
            <button
              onClick={() => onFilter({ query: "" })}
              // Внутри поля: rounded-md (8) − отступ 4 = 4 → DEFAULT.
              className="absolute right-1 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground"
              title={t("table.clear")}
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        {/* Фильтры — одной кнопкой: раскрывают строку под панелью, а не
            растягивают её вбок с прокруткой. Число — сколько условий включено. */}
        <Button
          variant={open || active > 0 ? "secondary" : "ghost"}
          size="sm"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <SlidersHorizontal className="size-3.5" />
          {t("table.filters")}
          {active > 0 && (
            <span className="flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-2xs font-bold text-primary-foreground">
              {active}
            </span>
          )}
        </Button>
        {/* Одна строка действий: главное с подписью, остальное значками. */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <div className="mr-1 whitespace-nowrap text-xs text-muted-foreground">
            {t("table.shownOf", { n: counts.shown, total: counts.total, placed: counts.placed })}
          </div>
          {!readOnly && (
            <>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={onImport}
                title={t("table.import")}
                aria-label={t("table.import")}
              >
                <Download className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={onFields}
                title={t("table.fields")}
                aria-label={t("table.fields")}
              >
                <Settings2 className="size-4" />
              </Button>
              <Button size="sm" onClick={onAdd}>
                <Plus className="size-3.5" />
                {t("table.addProduct")}
              </Button>
            </>
          )}
        </div>
      </div>
      {open && (
        <div className="flex flex-wrap items-center gap-2 px-3 pb-2">
          <select
            value={filter.category}
            onChange={(e) => onFilter({ category: e.target.value })}
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
          {partners.length > 0 && !readOnly && (
            <select
              value={filter.partnerId}
              onChange={(e) => onFilter({ partnerId: e.target.value })}
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
            value={filter.place}
            onChange={(place) => onFilter({ place })}
            options={PLACE_FILTERS.map((f) => ({ value: f.id, label: t(f.key) }))}
          />
        </div>
      )}
    </div>
  );
}
