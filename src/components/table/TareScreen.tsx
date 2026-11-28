import { useMemo, useState } from "react";
import { Layers, Package, Printer, X } from "lucide-react";
import { selectRole, useEditor } from "@/lib/store";
import { useT, type MsgKey } from "@/lib/i18n";
import { formatAddress } from "@/lib/address";
import { useWarehouseProducts } from "@/lib/warehouseProducts";
import { buildTareRows, tareContents, type TareRow, type TareState } from "@/lib/tareRegistry";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, Td, Tr } from "@/components/ui/table";
import { SortTh, TableFilters, TableSearch, useDataTable } from "@/components/ui/data-table";
import { DialogFooter, DialogHeader, DialogShell } from "@/components/ui/dialog-shell";
import { EmptyState } from "@/components/fulfillment/ScreenShell";
import { cn } from "@/lib/utils";

/** Цвет состояния — по роли, как у остальных статусов кабинета. */
const STATE_TONE: Record<TareState, string> = {
  unprinted: "warn-chip",
  empty: "text-muted-foreground",
  filled: "text-success",
  onPallet: "text-success",
  sealed: "text-primary",
};

type T = ReturnType<typeof useT>;

/** «3 поз. · 40 шт.»; у паллеты ещё коробки. Пустое — «—», а не ноль. */
function inside(r: TareRow, t: T): string {
  if (r.units === 0 && r.boxCount === 0) return "—";
  const parts = [t("tare.units", { p: r.positions, n: r.units })];
  if (r.kind === "pallet") parts.unshift(t("tare.boxes", { n: r.boxCount }));
  return parts.join(" · ");
}

function printed(r: TareRow, t: T): string {
  if (!r.printedAt) return "—";
  const d = new Date(r.printedAt).toLocaleDateString(t.lang);
  return r.printCount > 1 ? t("tare.printedTimes", { d, n: r.printCount }) : d;
}

/**
 * Реестр выпущенной тары и паллет — третья вкладка «Товаров» (разбор
 * экранов 27.11). Каждый номер UK-BOX и UK-PLT: состояние, что внутри, где
 * стоит, когда печатали. Строка открывает карточку; из неё — перепечатка
 * на «Наклейках». Экран только читает: тару выпускают «Наклейки» и приёмка.
 */
export function TareScreen() {
  const t = useT();
  const boxes = useEditor((s) => s.boxes);
  const pallets = useEditor((s) => s.pallets);
  const warehouse = useEditor((s) => s.warehouse);
  const seller = useEditor((s) => selectRole(s) === "seller");
  const products = useWarehouseProducts();
  // Продавец видит только тару со своим товаром и в ней только свои строки.
  const visible = useMemo(
    () => (seller ? new Set(products.map((p) => p.id)) : undefined),
    [seller, products],
  );
  const rows = useMemo(() => buildTareRows(boxes, pallets, visible), [boxes, pallets, visible]);
  const codeOf = useMemo(() => new Map(pallets.map((p) => [p.id, p.barcode])), [pallets]);
  const allProducts = useEditor((s) => s.products);
  const productOf = useMemo(() => new Map(allProducts.map((p) => [p.id, p])), [allProducts]);
  // Главный товар строки и «и ещё N»: что лежит в таре, видно без карточки.
  const goods = (r: TareRow): string => {
    const first = productOf.get(r.productIds[0] ?? "")?.name;
    if (!first) return "";
    const rest = r.productIds.length - 1;
    return rest > 0 ? `${first} ${t("tare.more", { n: rest })}` : first;
  };
  // Поиск по товару внутри: название, артикул, штрихкод — найдётся вся тара
  // с ним (Кирилл 28.11: «поиск по товару в таре»).
  const searchText = (r: TareRow): string =>
    [
      r.code,
      ...r.productIds.flatMap((id) => {
        const p = productOf.get(id);
        return p ? [p.name, p.sku, p.barcode] : [];
      }),
    ].join(" ");

  const where = (r: TareRow): string => {
    if (r.address) return formatAddress(warehouse, r.address) ?? t("tare.where.gone");
    if (r.palletId) return t("tare.where.pallet", { code: codeOf.get(r.palletId) ?? "—" });
    return "";
  };

  const reg = useDataTable(
    rows,
    [
      // Сортировка по числу из номера; поиск — по номеру целиком (колонка search).
      { id: "code", value: (r) => r.n ?? r.code },
      { id: "kind", value: (r) => r.kind, facet: (v) => t(`tare.kind.${v}` as MsgKey) },
      { id: "state", value: (r) => r.state, facet: (v) => t(`tare.state.${v}` as MsgKey) },
      { id: "units", value: (r) => r.units },
      { id: "where", value: (r) => where(r) },
      { id: "printed", value: (r) => r.printedAt },
      { id: "search", value: searchText },
    ],
    [{ id: "code", desc: true }],
  );
  const [open, setOpen] = useState<TareRow | null>(null);

  if (rows.length === 0)
    return (
      <div className="p-4">
        <EmptyState
          icon={<Package className="size-5" />}
          title={t("tare.emptyTitle")}
          body={t(seller ? "tare.emptySeller" : "tare.empty")}
        />
      </div>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
      <div className="flex flex-wrap items-center gap-2">
        <TableSearch value={reg.query} onChange={reg.setQuery} placeholder={t("tare.search")} />
        <TableFilters
          facets={reg.facets}
          filters={reg.filters}
          onChange={reg.setFilter}
          labels={{ kind: t("tare.col.kind"), state: t("tare.col.state") }}
          allLabel={(col) => t("common.filterAll", { col })}
        />
        <span className="ml-auto text-sm text-muted-foreground">
          {t("tare.count", { n: reg.rows.length, total: rows.length })}
        </span>
      </div>
      <Table>
        <TableHeader sticky>
          <SortTh table={reg.table} id="code">
            {t("tare.col.code")}
          </SortTh>
          <SortTh table={reg.table} id="state">
            {t("tare.col.state")}
          </SortTh>
          <SortTh table={reg.table} id="units">
            {t("tare.col.inside")}
          </SortTh>
          <SortTh table={reg.table} id="where">
            {t("tare.col.where")}
          </SortTh>
          <SortTh table={reg.table} id="printed">
            {t("tare.col.printed")}
          </SortTh>
        </TableHeader>
        <tbody>
          {reg.rows.map((r) => (
            <Tr key={r.id} onOpen={() => setOpen(r)}>
              <Td nowrap>
                <span className="inline-flex items-center gap-2 font-mono text-sm">
                  {r.kind === "box" ? (
                    <Package className="size-4 text-muted-foreground" />
                  ) : (
                    <Layers className="size-4 text-muted-foreground" />
                  )}
                  {r.code}
                </span>
              </Td>
              <Td data-label={t("tare.col.state")}>
                <span className={cn("text-sm", STATE_TONE[r.state])}>
                  {t(`tare.state.${r.state}` as MsgKey)}
                </span>
              </Td>
              <Td data-label={t("tare.col.inside")}>
                {goods(r) && <span className="block max-w-72 truncate">{goods(r)}</span>}
                <span className="text-sm tabular-nums text-muted-foreground">{inside(r, t)}</span>
              </Td>
              <Td className="text-muted-foreground" data-label={t("tare.col.where")}>
                {where(r) || "—"}
              </Td>
              <Td className="tabular-nums text-muted-foreground" data-label={t("tare.col.printed")}>
                {printed(r, t)}
              </Td>
            </Tr>
          ))}
          {reg.rows.length === 0 && (
            <Tr>
              <Td colSpan={5} className="py-8 text-center text-muted-foreground">
                {t("tare.nothing")}
              </Td>
            </Tr>
          )}
        </tbody>
      </Table>
      {open && (
        <TareCard
          row={open}
          where={where(open)}
          visible={visible}
          readOnly={seller}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

/** Карточка тары справа: состав, где стоит, печать. */
function TareCard({
  row,
  where,
  visible,
  readOnly,
  onClose,
}: {
  row: TareRow;
  where: string;
  visible?: ReadonlySet<string>;
  readOnly: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const boxes = useEditor((s) => s.boxes);
  const pallets = useEditor((s) => s.pallets);
  const products = useEditor((s) => s.products);
  const printTare = useEditor((s) => s.printTare);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const lines = tareContents(row, boxes, pallets, visible);

  return (
    <DialogShell size="md" sheet scroll onClose={onClose}>
      <DialogHeader>
        <div className="min-w-0">
          <h2 className="font-mono text-sm font-semibold">{row.code}</h2>
          <p className="text-xs text-muted-foreground">
            {t(`tare.kind.${row.kind}` as MsgKey)} · {t(`tare.state.${row.state}` as MsgKey)}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t("tasks.card.close")}>
          <X />
        </Button>
      </DialogHeader>
      <div className="flex flex-col gap-4 overflow-auto px-5 py-4 text-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          <dt className="text-muted-foreground">{t("tare.col.where")}</dt>
          <dd>{where || t("tare.where.none")}</dd>
          <dt className="text-muted-foreground">{t("tare.col.printed")}</dt>
          <dd>{printed(row, t)}</dd>
          <dt className="text-muted-foreground">{t("tare.created")}</dt>
          <dd>{new Date(row.createdAt).toLocaleDateString(t.lang)}</dd>
        </dl>
        <div>
          <h3 className="mb-1.5 font-medium">{t("tare.contents")}</h3>
          {lines.length === 0 ? (
            <p className="text-muted-foreground">
              {t(row.state === "sealed" ? "tare.sealedNote" : "tare.emptyNote")}
            </p>
          ) : (
            <Table>
              <tbody>
                {lines.map((l) => (
                  <Tr key={l.productId}>
                    <Td>
                      <span className="block">{byId.get(l.productId)?.name ?? "—"}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {byId.get(l.productId)?.sku}
                      </span>
                    </Td>
                    <Td align="right" className="tabular-nums">
                      {t("tare.qty", { n: l.qty })}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </div>
      {!readOnly && (
        <DialogFooter>
          <Button variant="outline" onClick={() => printTare(row.kind, [row.code])}>
            <Printer />
            {t(row.printedAt ? "tare.reprint" : "tare.print")}
          </Button>
        </DialogFooter>
      )}
    </DialogShell>
  );
}
