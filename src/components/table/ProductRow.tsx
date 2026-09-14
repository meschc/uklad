import { Barcode, ExternalLink, MapPin, Pencil, Truck } from "lucide-react";
import { cm } from "@/lib/address";
import { catLabel, useT } from "@/lib/i18n";
import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { RowCheck } from "./RowCheck";
import type { TableRow } from "./tableRows";

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

/**
 * Строка таблицы номенклатуры. Ничего не решает сама: что делать по клику,
 * знает экран — строка только показывает товар и зовёт переданное действие.
 */
export function ProductRow({
  row,
  partner,
  picked,
  readOnly,
  onPick,
  onReveal,
  onAssign,
  onEdit,
  onBarcode,
  onRequest,
}: {
  row: TableRow;
  /** Имя партнёра — уже найденное: строка знает только его id. */
  partner: string;
  picked: boolean;
  readOnly: boolean;
  onPick: (e: React.MouseEvent) => void;
  onReveal: () => void;
  onAssign: () => void;
  onEdit: () => void;
  onBarcode: () => void;
  onRequest: () => void;
}) {
  const t = useT();
  const { product: p, place, qty } = row;
  const url = safeUrl(p.url);

  return (
    <tr
      className={cn(
        "group/row border-b border-border/60 transition-colors hover:bg-accent/40",
        picked && "bg-primary/5",
      )}
    >
      <td className="px-3 py-1.5">
        <RowCheck
          checked={picked}
          onChange={onPick}
          label={p.name}
          title={t("table.bulk.shiftHint")}
        />
      </td>
      <td className="px-3 py-1.5">
        <ProductThumb product={p} />
      </td>
      <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{p.sku}</td>
      <td className="px-3 py-1.5 font-medium">
        <span className="inline-flex items-center gap-1.5">
          {p.name}
          {url && (
            <a
              href={url}
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
          onClick={onBarcode}
          title={t("table.showBarcode")}
          className="group/bc inline-flex items-center gap-1.5 rounded transition-colors hover:text-foreground"
        >
          {p.barcode}
          <Barcode className="size-3.5 opacity-0 transition-opacity group-hover/row:opacity-50 group-hover/bc:opacity-100" />
        </button>
      </td>
      <td className="px-3 py-1.5">
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{catLabel(t, p.category)}</span>
      </td>
      <td className="px-3 py-1.5 text-xs text-muted-foreground">{partner || "—"}</td>
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
            /* Продавцу адрес нужен не как текст, а как место: клик открывает
               план на нужной секции с раскрытой полкой. */
            <button
              onClick={onReveal}
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
            {/* Клик по адресу — «показать на плане», карандаш — сменить место:
                разные намерения, разные цели. */}
            <button onClick={onReveal} title={t("table.showOnPlan")}>
              <AddressChip address={place} />
            </button>
            <button
              onClick={onAssign}
              title={t("table.editPlace")}
              className="opacity-0 transition-opacity group-hover/place:opacity-100"
            >
              <Pencil className="size-3 text-muted-foreground" />
            </button>
          </span>
        ) : (
          <button
            onClick={onAssign}
            className="inline-flex items-center gap-1 rounded border border-dashed border-border px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
          >
            <MapPin className="size-3" />
            {t("table.assignBtn")}
          </button>
        )}
      </td>
      <td className="px-2 py-1.5">
        <div className="flex items-center justify-end gap-1">
          {/* Продавцу из таблицы нужна ровно одна операция — набрать заявку
              на отгрузку (п.3). */}
          {readOnly && (
            <button
              onClick={onRequest}
              title={t("seller.request")}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-accent hover:text-primary group-hover/row:text-muted-foreground"
            >
              <Truck className="size-3.5" />
            </button>
          )}
          <button
            onClick={onEdit}
            title={t("table.editProduct")}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground group-hover/row:text-muted-foreground"
          >
            <Pencil className="size-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}
