import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, FileText, MapPin, Play, Printer, ScanLine, Truck, X } from "lucide-react";
import { useEditor } from "@/lib/store";
import { requestsRepository } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import { formatAddress } from "@/lib/address";
import { stockByProduct } from "@/lib/fulfillment";
import { targetCode } from "@/lib/packing";
import { useLabelPrinter } from "@/lib/labelPrinter";
import { printLabels } from "@/lib/printLabels";
import type { FulfillmentRequest, LabelTemplate, RequestStatus } from "@/lib/types";
import { useT, type TFunc } from "@/lib/i18n";
import { cn, nowMs } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LabelPrint } from "./LabelPrint";
import { ShipConfirm } from "./ShipConfirm";

/**
 * Заявки одного назначения в карточке задания «Сборка»: то, что раньше было
 * таблицей на вкладке «Заявки на сборку». Одна машина увозит всё, что
 * адресовано одному получателю, поэтому карточка — по назначению, а заявки
 * внутри — с теми же действиями, что и были: взять в работу, отменить, идти
 * собирать, печать этикетки назначения, погрузка, накладная уехавшей.
 */

function dayStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
const isOverdue = (ts: number) => ts < dayStart(nowMs());

export function StatusBadge({
  status,
  partial,
  t,
}: {
  status: RequestStatus;
  partial?: boolean;
  t: TFunc;
}) {
  const tone: Record<RequestStatus, string> = {
    new: "bg-warning-fill text-warning-foreground",
    in_progress: "bg-primary/10 text-primary",
    done: "bg-success/15 text-success",
    // Отгружено — финал пути: спокойный синий, чтобы отличать от «собрано».
    shipped: "bg-primary/15 text-primary",
    cancelled: "bg-muted text-muted-foreground",
  };
  return (
    <span className={cn("inline-block rounded px-1.5 py-0.5 text-2xs font-semibold", tone[status])}>
      {t(`req.status.${status}`)}
      {status === "done" && partial ? ` · ${t("req.partial")}` : ""}
    </span>
  );
}

export function RequestGroupCard({ target, closed }: { target: string | null; closed: boolean }) {
  const t = useT();
  const requests = useEditor((s) => s.requests);
  const products = useEditor((s) => s.products);
  const warehouse = useEditor((s) => s.warehouse);
  const placements = useEditor((s) => s.placements);
  const boxes = useEditor((s) => s.boxes);
  const trips = useEditor((s) => s.shipments);
  const notify = useEditor((s) => s.notify);
  const goToView = useEditor((s) => s.goToView);
  const openDoc = useEditor((s) => s.openDoc);
  const printer = useLabelPrinter();
  const [labelTarget, setLabelTarget] = useState<string | null>(null);
  const [shipAsk, setShipAsk] = useState<FulfillmentRequest[] | null>(null);

  // Смена статуса — через репозиторий; кнопки на время команды заняты:
  // двойное «взять в работу» по одной заявке с сетью — обычное дело.
  const status = useCommand((id: string, next: RequestStatus) =>
    requestsRepository.setStatus(id, next),
  );
  const setStatus = async (id: string, next: RequestStatus) => {
    const res = await status.run(id, next);
    if (!res.ok) notify("error", res.error);
  };

  const stock = useMemo(() => stockByProduct(placements, boxes), [placements, boxes]);
  const items = requests.filter(
    (r) =>
      (r.note?.trim() || null) === target &&
      (closed
        ? r.status === "shipped" || r.status === "cancelled"
        : r.status !== "shipped" && r.status !== "cancelled"),
  );
  const dates = [
    ...new Set(
      items
        .filter((r) => r.status !== "shipped" && r.status !== "cancelled")
        .map((r) => r.truckDate)
        .filter((d): d is number => typeof d === "number"),
    ),
  ].sort((a, b) => a - b);
  const ready = items.filter((r) => r.status === "done");

  // Печатная версия появляется в дереве после установки — печать запускает запуск ниже.
  const tpl: LabelTemplate = {
    id: "target",
    name: "target",
    widthMm: printer.widthMm,
    heightMm: printer.heightMm,
    layout: printer.widthMm >= printer.heightMm ? "horizontal" : "vertical",
    codeType: "qr",
    elements: ["code"],
    codeScale: 0.6,
    createdAt: 0,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <MapPin className="size-3.5 text-muted-foreground" />
        <span className="text-sm font-medium">{target ?? t("tasks.noTarget")}</span>
        <span className="text-xs text-muted-foreground">
          {t("tasks.groupCount", { n: items.length })}
        </span>
        {dates.length === 0 && !closed ? (
          <span className="text-xs text-muted-foreground">{t("tasks.noShipDate")}</span>
        ) : (
          dates.map((d) => (
            <span
              key={d}
              className={cn(
                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-2xs font-semibold",
                isOverdue(d)
                  ? "bg-destructive/15 text-destructive"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <CalendarClock className="size-3" />
              {t("tasks.shipDate", { d: new Date(d).toLocaleDateString() })}
              {isOverdue(d) ? ` · ${t("tasks.overdue")}` : ""}
            </span>
          ))
        )}
      </div>

      {(target || ready.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {target && (
            <Button
              size="sm"
              variant="outline"
              title={t("tasks.printLabelHint", { size: `${printer.widthMm}×${printer.heightMm}` })}
              onClick={() => setLabelTarget(target)}
            >
              <Printer />
              {t("tasks.printLabel")}
            </Button>
          )}
          {/* Погрузка: собранное по этому назначению уезжает одной машиной.
              Грузят за столом отгрузки — кнопка ведёт туда после подтверждения. */}
          {ready.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setShipAsk(ready)}>
              <Truck className="size-3.5" />
              {t("ship.action", { n: ready.length })}
            </Button>
          )}
        </div>
      )}

      <ul className="flex flex-col divide-y divide-border">
        {items.map((r) => {
          const p = products.find((x) => x.id === r.productId);
          const have = stock.get(r.productId)?.qty ?? 0;
          const trip =
            r.status === "shipped" ? trips.find((s) => s.requestIds.includes(r.id)) : undefined;
          return (
            <li key={r.id} className="flex flex-col gap-1.5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{p?.name ?? "—"}</p>
                  <p className="font-mono text-2xs text-muted-foreground">{p?.sku}</p>
                </div>
                <StatusBadge status={r.status} partial={r.partial} t={t} />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className={cn("tabular-nums", have < r.qty && "text-destructive")}>
                  {r.pickedQty ? `${r.pickedQty}/` : ""}
                  {r.qty}
                </span>
                <span>{t("tasks.inStock", { n: have })}</span>
                {r.targetAddress && <span>{formatAddress(warehouse, r.targetAddress)}</span>}
                {/* Бронь под поставку: заявку нельзя читать как обычную — товара ещё нет. */}
                {r.reservedShipmentId && (
                  <span className="rounded bg-warning-fill px-1 py-0.5 text-2xs font-semibold text-warning-foreground">
                    {t("req.reservedBadge")}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {r.status === "new" && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={status.pending}
                      onClick={() => setStatus(r.id, "in_progress")}
                    >
                      <Play className="size-3" />
                      {t("tasks.take")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={status.pending}
                      onClick={() => setStatus(r.id, "cancelled")}
                    >
                      <X className="size-3.5" />
                      {t("tasks.cancel")}
                    </Button>
                  </>
                )}
                {r.status === "in_progress" && (
                  <Button size="sm" onClick={() => goToView("workstation")}>
                    <ScanLine className="size-3" />
                    {t("tasks.pick")}
                  </Button>
                )}
                {/* Уехавшая заявка ведёт к накладной рейса: её правят и подтверждают в «Документах». */}
                {trip && (
                  <Button size="sm" variant="ghost" onClick={() => openDoc("shipment", trip.id)}>
                    <FileText className="size-3" />
                    {t("doc.kind.shipmentShort")}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {shipAsk && (
        <ShipConfirm
          target={target ?? t("tasks.noTarget")}
          items={shipAsk}
          onClose={() => setShipAsk(null)}
        />
      )}
      {labelTarget && (
        <PrintTarget tpl={tpl} target={labelTarget} onDone={() => setLabelTarget(null)} />
      )}
    </div>
  );
}

function PrintTarget({
  tpl,
  target,
  onDone,
}: {
  tpl: LabelTemplate;
  target: string;
  onDone: () => void;
}) {
  // Печать запускается один раз на показ; колбэк «готово» берём из ref, чтобы
  // новая функция на каждой перерисовке не запускала печать заново.
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    printLabels(() => done.current());
  }, []);
  return (
    <LabelPrint
      tpl={tpl}
      items={[{ code: targetCode(target), headline: target }]}
      kind="custom"
      warehouseName=""
    />
  );
}
