import { ArrowUpDown } from "lucide-react";
import { useState } from "react";
import { useT, type MsgKey } from "@/lib/i18n";
import type { ColId } from "./columns";
import { cn } from "@/lib/utils";
import { eyebrow } from "@/components/ui/eyebrow";
import { RowCheck } from "./RowCheck";
import type { SortKey } from "./tableRows";

const COLS: Record<ColId, { label: MsgKey; sort?: SortKey; className?: string }> = {
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
        {order
          .filter((c) => !(hidePartner && c === "partner"))
          .map((c) => {
            const col = COLS[c];
            return (
              <Th
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
              </Th>
            );
          })}
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
  drag,
}: {
  children?: React.ReactNode;
  className?: string;
  sortable?: boolean;
  onClick?: () => void;
  drag?: { onDragStart: () => void; onDragEnd: () => void; onDrop: () => void };
}) {
  return (
    <th
      className={cn(
        eyebrow({ className: "whitespace-nowrap px-3 py-2" }),
        sortable && "cursor-pointer select-none hover:text-foreground",
        className,
      )}
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
    </th>
  );
}
