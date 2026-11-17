import { Barcode, ExternalLink, MapPin, Pencil, Truck } from "lucide-react";
import { cm } from "@/lib/address";
import { catLabel, useT } from "@/lib/i18n";
import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { asciiAvatar } from "@/lib/asciiAvatar";
import { RowCheck } from "./RowCheck";
import type { TableRow } from "./tableRows";
import type { ColId } from "./columns";
import { cloneElement, Fragment, type ReactElement } from "react";
import { COLS } from "./TableHead";

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

/**
 * Миниатюра товара: настоящее фото, а без него — ASCII-аватарка из артикула
 * (`lib/asciiAvatar.ts`, Кирилл 14.11: «ко всем изображениям»). Картинка
 * своя у каждого товара и не меняется, внешних картинок нет.
 */
function ProductThumb({ product }: { product: Product }) {
  const t = useT();
  return (
    <img
      src={product.imageUrl || asciiAvatar(product.sku, "small")}
      alt=""
      loading="lazy"
      title={product.imageUrl ? undefined : t("table.photoTitle", { sku: product.sku })}
      className="size-9 shrink-0 rounded-md border border-black/10 bg-black object-cover"
    />
  );
}

/** Зона касания адреса на телефоне — 44 px при рисунке в 20: как у галочки строки. */
const TAP = "tap-target";

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
  order,
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
  /** Порядок столбцов, выставленный человеком. */
  order: ColId[];
}) {
  const t = useT();
  const { product: p, place, qty } = row;
  const url = safeUrl(p.url);
  const cells: Record<ColId, ReactElement<{ "data-label"?: string }>> = {
    photo: (
      <td className="stack-lead px-3 py-1.5">
        <ProductThumb product={p} />
      </td>
    ),
    sku: <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{p.sku}</td>,
    name: (
      <td className="stack-title px-3 py-1.5 font-medium">
        <span className="inline-flex items-center gap-1.5">
          {p.name}
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title={t("table.openUrl")}
              className="text-muted-foreground transition-colors hover:text-primary"
            >
              <ExternalLink className="size-3.5" />
            </a>
          )}
        </span>
      </td>
    ),
    barcode: (
      <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground max-md:!hidden">
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
    ),
    category: (
      <td className="px-3 py-1.5 max-md:!hidden">
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{catLabel(t, p.category)}</span>
      </td>
    ),
    partner: <td className="px-3 py-1.5 text-xs text-muted-foreground">{partner || "—"}</td>,
    dims: (
      <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-muted-foreground max-md:!hidden">
        {cm(p.widthCm)} × {cm(p.heightCm)} × {cm(p.depthCm)}
      </td>
    ),
    weight: (
      <td className="px-3 py-1.5 tabular-nums text-muted-foreground max-md:!hidden">
        {p.weightKg != null ? cm(p.weightKg) : "—"}
      </td>
    ),
    qty: (
      <td
        className={cn(
          "px-3 py-1.5 tabular-nums",
          qty > 0 ? "font-medium" : "text-muted-foreground",
        )}
      >
        {qty}
      </td>
    ),
    place: (
      <td className="px-3 py-1.5">
        {readOnly ? (
          place ? (
            /* Продавцу адрес нужен не как текст, а как место: клик открывает
               план на нужной секции с раскрытой полкой. */
            <button
              onClick={onReveal}
              title={t("table.showOnPlan")}
              className={cn("group/place inline-flex items-center gap-1", TAP)}
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
            <button onClick={onReveal} title={t("table.showOnPlan")} className={TAP}>
              <AddressChip address={place} />
            </button>
            <button
              onClick={onAssign}
              title={t("table.editPlace")}
              aria-label={t("table.editPlace")}
              // На телефоне наведения нет: карандаш виден всегда и под палец.
              className="opacity-0 transition-opacity group-hover/place:opacity-100 max-md:inline-flex max-md:size-11 max-md:items-center max-md:justify-center max-md:opacity-100"
            >
              <Pencil className="size-3 text-muted-foreground" />
            </button>
          </span>
        ) : (
          <button
            onClick={onAssign}
            className="inline-flex items-center gap-1 rounded border border-dashed border-border px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary max-md:min-h-11 max-md:px-3"
          >
            <MapPin className="size-3" />
            {t("table.assignBtn")}
          </button>
        )}
      </td>
    ),
  };

  return (
    <tr
      className={cn(
        "group/row border-b border-border/60 transition-colors hover:bg-accent/40",
        picked && "bg-primary/5",
      )}
    >
      <td className="stack-lead px-3 py-1.5">
        <RowCheck
          checked={picked}
          onChange={onPick}
          label={p.name}
          title={t("table.bulk.shiftHint")}
        />
      </td>
      {order
        .filter((c) => !(readOnly && c === "partner"))
        .map((c) => (
          <Fragment key={c}>
            {/* На телефоне строка — карточка (`table-stack`): у значения
                подпись колонки. Фото и название — шапка карточки, без подписи;
                штрихкод, категория, габариты и вес на телефоне не показываем —
                карточка короче, а всё это есть в карточке товара. */}
            {c === "photo" || c === "name"
              ? cells[c]
              : cloneElement(cells[c], { "data-label": t(COLS[c].label) })}
          </Fragment>
        ))}
      <td className="stack-head px-2 py-1.5">
        <div className="flex items-center justify-end gap-1">
          {/* Продавцу из таблицы нужна ровно одна операция — набрать заявку
              на отгрузку (п.3). */}
          {readOnly && (
            <button
              onClick={onRequest}
              title={t("seller.request")}
              className="flex size-7 items-center justify-center rounded-md max-md:min-h-11 max-md:min-w-11 text-muted-foreground transition-colors hover:bg-accent hover:text-primary group-hover/row:text-muted-foreground"
            >
              <Truck className="size-3.5" />
            </button>
          )}
          <button
            onClick={onEdit}
            title={t("table.editProduct")}
            className="flex size-7 items-center justify-center rounded-md max-md:min-h-11 max-md:min-w-11 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground group-hover/row:text-muted-foreground"
          >
            <Pencil className="size-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}
