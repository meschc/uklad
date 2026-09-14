import { ArrowUpDown } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { eyebrow } from "@/components/ui/eyebrow";
import { RowCheck } from "./RowCheck";
import type { SortKey } from "./tableRows";

/** Шапка таблицы: отметить всё и переключить сортировку по колонке. */
export function TableHead({
  allPicked,
  somePicked,
  onToggleAll,
  onSort,
}: {
  allPicked: boolean;
  somePicked: boolean;
  onToggleAll: () => void;
  onSort: (key: SortKey) => void;
}) {
  const t = useT();
  return (
    <thead className="sticky top-0 z-10 bg-card">
      <tr className="border-b border-border text-left">
        <Th className="w-9">
          <RowCheck
            checked={allPicked}
            partial={somePicked}
            onChange={onToggleAll}
            label={t("table.bulk.selectAll")}
          />
        </Th>
        <Th className="w-12">{t("table.col.photo")}</Th>
        <Th sortable onClick={() => onSort("sku")}>
          {t("table.col.sku")}
        </Th>
        <Th sortable onClick={() => onSort("name")}>
          {t("table.col.name")}
        </Th>
        <Th>{t("table.col.barcode")}</Th>
        <Th sortable onClick={() => onSort("category")}>
          {t("table.col.category")}
        </Th>
        <Th sortable onClick={() => onSort("partner")}>
          {t("table.col.partner")}
        </Th>
        <Th>{t("table.col.dims")}</Th>
        <Th sortable onClick={() => onSort("weight")}>
          {t("table.col.weight")}
        </Th>
        <Th sortable onClick={() => onSort("qty")}>
          {t("table.col.qty")}
        </Th>
        <Th sortable onClick={() => onSort("place")}>
          {t("table.col.place")}
        </Th>
        <Th className="w-10" />
      </tr>
    </thead>
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
        eyebrow({ className: "whitespace-nowrap px-3 py-2" }),
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
