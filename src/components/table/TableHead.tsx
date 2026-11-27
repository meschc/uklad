import { ArrowUpDown } from "lucide-react";
import { useState } from "react";
import { useT, type MsgKey } from "@/lib/i18n";
import type { ColId } from "./columns";
import { cn } from "@/lib/utils";
import { RowCheck } from "./RowCheck";
import type { SortKey } from "./tableRows";
import { TableHeader, Th } from "@/components/ui/table";

export const COLS: Record<ColId, { label: MsgKey; sort?: SortKey; className?: string }> = {
  photo: { label: "table.col.photo", className: "w-12" },
  sku: { label: "table.col.sku", sort: "sku" },
  name: { label: "table.col.name", sort: "name" },
  barcode: { label: "table.col.barcode" },
  category: { label: "table.col.category", sort: "category" },
  partner: { label: "table.col.partner", sort: "partner" },
  dims: { label: "table.col.dims" },
  weight: { label: "table.col.weight", sort: "weight" },
  qty: { label: "table.col.qty", sort: "qty" },
  place: { label: "table.col.place", sort: "place" },
};

/**
 * Шапка таблицы: отметить всё, переключить сортировку по колонке и
 * перетащить заголовок, чтобы переставить столбец.
 */
export function TableHead({
  allPicked,
  somePicked,
  onToggleAll,
  onSort,
  hidePartner,
  order,
  onMove,
}: {
  allPicked: boolean;
  somePicked: boolean;
  onToggleAll: () => void;
  onSort: (key: SortKey) => void;
  /** Продавцу колонка «партнёр» не нужна: весь товар здесь его. */
  hidePartner?: boolean;
  order: ColId[];
  onMove: (from: ColId, to: ColId) => void;
}) {
  const t = useT();
  const [drag, setDrag] = useState<ColId | null>(null);
  return (
    <TableHeader sticky>
      <HeadCell className="w-9">
        <RowCheck
          checked={allPicked}
          partial={somePicked}
          onChange={onToggleAll}
          label={t("table.bulk.selectAll")}
        />
      </HeadCell>
      {order
        .filter((c) => !(hidePartner && c === "partner"))
        .map((c) => {
          const col = COLS[c];
          return (
            <HeadCell
              key={c}
              className={cn(col.className, drag === c && "opacity-40")}
              sortable={!!col.sort}
              onClick={col.sort ? () => onSort(col.sort!) : undefined}
              drag={{
                onDragStart: () => setDrag(c),
                onDragEnd: () => setDrag(null),
                onDrop: () => drag && onMove(drag, c),
              }}
            >
              {t(col.label)}
            </HeadCell>
          );
        })}
      <HeadCell className="w-10" />
    </TableHeader>
  );
}

function HeadCell({
  children,
  className,
  sortable,
  onClick,
  drag,
}: {
  children?: React.ReactNode;
  className?: string;
  sortable?: boolean;
  onClick?: () => void;
  drag?: { onDragStart: () => void; onDragEnd: () => void; onDrop: () => void };
}) {
  return (
    <Th
      nowrap
      className={cn(sortable && "cursor-pointer select-none hover:text-foreground", className)}
      onClick={onClick}
      draggable={!!drag}
      onDragStart={drag?.onDragStart}
      onDragEnd={drag?.onDragEnd}
      onDragOver={drag ? (e) => e.preventDefault() : undefined}
      onDrop={drag?.onDrop}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sortable && <ArrowUpDown className="size-3 opacity-40" />}
      </span>
    </Th>
  );
}
