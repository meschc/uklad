import { Plus, Search, Settings2, Upload, X } from "lucide-react";
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
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filter.query}
          onChange={(e) => onFilter({ query: e.target.value })}
          placeholder={t("table.search")}
          className="h-8 w-72 pl-8 pr-7"
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
      {partners.length > 0 && (
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

      {!readOnly && (
        <>
          <Button size="sm" className="ml-auto" onClick={onAdd}>
            <Plus className="size-3.5" />
            {t("table.addProduct")}
          </Button>

          <Button variant="outline" size="sm" onClick={onImport}>
            <Upload className="size-3.5" />
            {t("table.import")}
          </Button>

          <Button variant="outline" size="sm" onClick={onFields}>
            <Settings2 className="size-3.5" />
            {t("table.fields")}
          </Button>
        </>
      )}

      <div className="text-xs text-muted-foreground">
        {t("table.shownOf", { n: counts.shown, total: counts.total, placed: counts.placed })}
      </div>
    </div>
  );
}
