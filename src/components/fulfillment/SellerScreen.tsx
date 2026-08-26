import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  CalendarClock,
  Check,
  Download,
  MapPin,
  Package,
  PackagePlus,
  Plus,
  Truck,
  Upload,
} from "lucide-react";
import { useEditor } from "@/lib/store";
import { groupRequestsByTarget } from "@/lib/fulfillment";
import { useT, type TFunc } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Input } from "@/components/ui/input";
import { TableScreen } from "@/components/table/TableScreen";
import { EmptyState } from "./ScreenShell";
import { Modal, Field } from "./Modal";
import { SupplyDialog } from "./SupplyDialog";
import { RequestDialog } from "./RequestDialog";
import { StatusBadge } from "./TasksScreen";

/**
 * Кабинет продавца (п.7). Те же локальные данные, другой набор экранов и без
 * прав на структуру склада: продавец видит остатки и адреса на чтение и
 * создаёт заявки на отгрузку — по одной или пакетом из таблицы.
 *
 * Остатки — это НЕ отдельная маленькая табличка, а та же таблица номенклатуры,
 * что у склада, только без складских действий (п.3). Своя урезанная копия
 * разъехалась бы с настоящей на первой же правке: не было бы ни сортировки,
 * ни габаритов, ни выделения диапазона.
 */

type Tab = "stock" | "requests";

export function SellerScreen() {
  const t = useT();
  const [tab, setTab] = useState<Tab>("stock");

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-5 py-3">
        <div className="min-w-0">
          <h1 className="text-base font-semibold tracking-tight">
            {t("seller.title")}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("seller.subtitle")}
          </p>
        </div>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "stock" as Tab, label: t("seller.tab.stock") },
            { value: "requests" as Tab, label: t("seller.tab.requests") },
          ]}
        />
      </header>

      {tab === "stock" ? (
        <TableScreen />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-6">
            <RequestsTab t={t} />
          </div>
        </div>
      )}
    </div>
  );
}

// --- 7.2 заявки продавца ------------------------------------------------------

function RequestsTab({ t }: { t: TFunc }) {
  const requests = useEditor((s) => s.requests);
  const products = useEditor((s) => s.products);
  const shipments = useEditor((s) => s.shipments);
  const shipmentOf = (id?: string) =>
    id ? shipments.find((sh) => sh.id === id) : undefined;
  const groups = useMemo(() => groupRequestsByTarget(requests), [requests]);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [supplying, setSupplying] = useState(false);
  const openSupplies = useEditor((s) =>
    s.expectedShipments.filter((sh) => sh.status !== "closed"),
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-3.5" />
          {t("seller.newRequest")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setImporting(true)}>
          <Upload className="size-3.5" />
          {t("seller.bulk")}
        </Button>
        {/* Обратное направление: не только забрать со склада, но и привезти
            на склад. Продавец предупреждает — склад принимает по строкам. */}
        <Button size="sm" variant="outline" onClick={() => setSupplying(true)}>
          <PackagePlus className="size-3.5" />
          {t("seller.newSupply")}
        </Button>
      </div>

      {/* Что уже едет на склад: продавец видит статус своих поставок. */}
      {openSupplies.length > 0 && (
        <div className="flex flex-col gap-1 rounded-lg border border-border bg-muted/30 p-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("seller.suppliesTitle")}
          </p>
          {openSupplies.map((s) => {
            const total = s.lines.reduce((a, l) => a + l.expectedQty, 0);
            const got = s.lines.reduce((a, l) => a + l.receivedQty, 0);
            return (
              <div
                key={s.id}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="truncate">{s.title ?? t("supply.noName")}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {t(`supply.status.${s.status}`)} · {got}/{total}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {requests.length === 0 ? (
        <EmptyState
          icon={<Package className="size-5" />}
          title={t("seller.emptyTitle")}
          body={t("seller.emptyBody")}
        />
      ) : (
        /* Группы по назначению: одна машина увозит всё, что едет одному
           получателю, — так продавец и держит свои заявки в голове (п.5). */
        groups.map((g) => (
          <section key={g.target ?? "—"} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <MapPin className="size-3.5 text-muted-foreground" />
              <h2 className="text-xs font-semibold uppercase tracking-wide">
                {g.target ?? t("tasks.noTarget")}
              </h2>
              <span className="text-[11px] text-muted-foreground">
                {t("tasks.groupCount", { n: g.items.length })}
              </span>
              {g.shipDates.length === 0 && (
                <span className="text-[11px] text-muted-foreground">
                  {t("tasks.noShipDate")}
                </span>
              )}
              {g.shipDates.map((d) => (
                <span
                  key={d}
                  className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
                >
                  <CalendarClock className="size-3" />
                  {t("tasks.shipDate", { d: new Date(d).toLocaleDateString() })}
                </span>
              ))}
            </div>
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-muted/50 text-xs">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">{t("table.col.name")}</th>
                    <th className="px-3 py-2 text-right font-medium">
                      {t("tasks.col.qty")}
                    </th>
                    <th className="px-3 py-2 font-medium">
                      {t("seller.col.shipDate")}
                    </th>
                    <th className="px-3 py-2 font-medium">{t("tasks.col.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((r) => {
                    const p = products.find((x) => x.id === r.productId);
                    return (
                      <tr key={r.id} className="border-t border-border/60">
                        <td className="px-3 py-2">
                          <div className="font-medium">{p?.name ?? "—"}</div>
                          <div className="font-mono text-[10px] text-muted-foreground">
                            {p?.sku}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.pickedQty ? `${r.pickedQty}/` : ""}
                          {r.qty}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {r.truckDate
                            ? new Date(r.truckDate).toLocaleDateString()
                            : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge status={r.status} partial={r.partial} t={t} />
                          {/* Продавцу важно не «собрано», а «уехало»: под
                              статусом показываем дату вывоза и машину. */}
                          {r.status === "shipped" && (
                            <div className="mt-0.5 text-[10px] text-muted-foreground">
                              {t("seller.shippedAt", {
                                d: new Date(
                                  r.shippedAt ?? r.updatedAt,
                                ).toLocaleDateString(),
                              })}
                              {shipmentOf(r.shipmentId)?.vehicle
                                ? ` · ${shipmentOf(r.shipmentId)!.vehicle}`
                                : ""}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}

      {creating && <RequestDialog onClose={() => setCreating(false)} />}
      {supplying && <SupplyDialog onClose={() => setSupplying(false)} />}
      {importing && (
        <BulkRequestDialog onClose={() => setImporting(false)} t={t} />
      )}
    </div>
  );
}

/**
 * Массовое создание заявок: каждая строка таблицы — отдельная заявка, дата
 * машины одна на весь пакет. Формат тот же, что у шаблона поставки, — третьего
 * механизма импорта в проекте быть не должно.
 */
function BulkRequestDialog({ onClose, t }: { onClose: () => void; t: TFunc }) {
  const products = useEditor((s) => s.products);
  const createRequests = useEditor((s) => s.createRequests);
  const [text, setText] = useState("");
  const [truck, setTruck] = useState("");

  const parsed = useMemo(() => {
    const bySku = new Map(products.map((p) => [p.sku.toLowerCase(), p]));
    const byBarcode = new Map(products.map((p) => [p.barcode, p]));
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, i) => {
        const cells = line.split(/[\t;,]/).map((c) => c.trim());
        const [code, qtyRaw, note] = cells;
        const product = bySku.get((code ?? "").toLowerCase()) ?? byBarcode.get(code ?? "");
        const qty = Math.round(parseFloat((qtyRaw ?? "").replace(",", ".")));
        return {
          index: i,
          code: code ?? "",
          qty: Number.isFinite(qty) ? qty : 0,
          note,
          product,
          ok: !!product && Number.isFinite(qty) && qty > 0,
        };
      })
      // Первая строка может быть заголовком — её просто не удастся сопоставить.
      .filter((r) => r.code !== "");
  }, [text, products]);

  const valid = parsed.filter((r) => r.ok);

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Артикул", "Количество", "Назначение"],
      ["УК-1001", 10, "Маркетплейс, склад Коледино"],
      ["УК-2001", 4, "Розница, ТЦ Метрополис"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Заявки");
    XLSX.writeFile(wb, "uklad-requests-template.xlsx");
  };

  const submit = () => {
    if (!valid.length) return;
    createRequests(
      valid.map((r) => ({
        productId: r.product!.id,
        qty: r.qty,
        note: r.note,
      })),
      truck ? new Date(truck).getTime() : undefined,
    );
    onClose();
  };

  return (
    <Modal
      title={t("seller.bulk")}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={t("seller.bulkCreate", { n: valid.length })}
      disabled={!valid.length}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={downloadTemplate}>
          <Download className="size-3.5" />
          {t("seller.bulkTemplate")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            setText("УК-1001;10;Маркетплейс, склад Коледино\nУК-2001;4;Розница")
          }
        >
          {t("recv.form.example")}
        </Button>
      </div>
      <Field label={t("seller.col.shipDate")}>
        <Input
          type="date"
          value={truck}
          onChange={(e) => setTruck(e.target.value)}
          className="h-9 max-w-48"
        />
      </Field>
      <Field label={t("seller.bulkRows")}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("seller.bulkPlaceholder")}
          className="scrollbar-thin h-28 w-full resize-none rounded-md border border-input bg-background p-2 font-mono text-xs"
        />
      </Field>
      {parsed.length > 0 && (
        <div className="max-h-40 overflow-y-auto rounded-md border border-border">
          <table className="w-full border-collapse text-xs">
            <tbody>
              {parsed.map((r) => (
                <tr key={r.index} className="border-b border-border/60 last:border-0">
                  <td className="px-2 py-1">
                    {r.ok ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <Check className="size-3" />
                      </span>
                    ) : (
                      <span className="text-destructive">×</span>
                    )}
                  </td>
                  <td className="px-2 py-1 font-mono text-muted-foreground">
                    {r.code}
                  </td>
                  <td className="px-2 py-1">{r.product?.name ?? t("seller.unknownSku")}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{r.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Truck className="size-3" />
        {t("seller.bulkNote")}
      </p>
    </Modal>
  );
}
