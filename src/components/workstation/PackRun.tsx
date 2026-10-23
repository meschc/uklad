import { useState } from "react";
import { Ban, History, Package, Printer, Tag, UserRound } from "lucide-react";
import { useEditor } from "@/lib/store";
import { workstationRepository } from "@/lib/data";
import {
  boxesHolding,
  packSummary,
  pendingLabel,
  toteContents,
  toteOrders,
  toteRemaining,
  type ItemScan,
} from "@/lib/packing";
import type { PackSession } from "@/lib/types";
import { useT, type MsgKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { card } from "@/components/ui/card";
import { eyebrow } from "@/components/ui/eyebrow";
import { QrSvg } from "@/components/table/QrSvg";
import { ScanField, type ScanStatus } from "@/components/fulfillment/ScanField";
import { shortId } from "./useNow";

export type PackResult = ReturnType<typeof packSummary> & { source: string; target: string };

type Feedback = { status: ScanStatus; key: MsgKey; name?: string; box?: string } | null;

/**
 * Поштучный цикл упаковки. Поле скана одно и всегда в фокусе: сканер сам
 * решает, что пришло — товар или этикетка. Текущая штука показана крупно —
 * монитор стоит на расстоянии вытянутой руки, а то и дальше.
 */
export function PackRun({
  session,
  onDone,
}: {
  session: PackSession;
  onDone: (r: PackResult) => void;
}) {
  const t = useT();
  const products = useEditor((s) => s.products);
  const requests = useEditor((s) => s.requests);
  const box = useEditor((s) => s.boxes.find((b) => b.id === session.sourceBoxId));
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [showLast, setShowLast] = useState(false);

  if (!box) return null;
  const contents = toteContents(box);
  const remaining = toteRemaining(session, box);
  const orders = toteOrders(requests, box);
  const label = pendingLabel(session);
  const unit = session.units.find((u) => !u.confirmedAt);
  const orderLabel = !unit ? session.orderLabels.find((l) => !l.confirmedAt) : undefined;
  const summary = packSummary(session, box);
  const nameOf = (id: string) => products.find((p) => p.id === id)?.name ?? id;

  const onScan = async (code: string) => {
    if (label) {
      const res = await workstationRepository.packLabel(code);
      if (res.ok) return setFeedback(null);
      // Не этикетка, а товар — значит, этикетку ещё не наклеили.
      const item = await workstationRepository.packItem(code);
      return setFeedback({
        status: "error",
        key:
          item.ok && item.data.kind === "label_pending" ? "ws.run.label_pending" : "ws.label.wrong",
      });
    }
    const res = await workstationRepository.packItem(code);
    if (!res.ok) return setFeedback({ status: "error", key: res.error });
    if (res.data.kind === "not_in_tote") {
      const where = boxesHolding(useEditor.getState().boxes, res.data.productId, box.id);
      return setFeedback({
        status: "error",
        key: where.length ? "ws.run.not_in_tote" : "ws.run.not_in_toteNowhere",
        name: nameOf(res.data.productId),
        box: where.slice(0, 3).join(", ") + (where.length > 3 ? " …" : ""),
      });
    }
    setFeedback(feedbackFor(res.data, nameOf));
  };

  const finish = async () => {
    const result: PackResult = { ...summary, source: box.barcode, target: session.targetCode };
    const res = await workstationRepository.packFinish();
    if (res.ok) onDone(result);
  };

  const product = unit && products.find((p) => p.id === unit.productId);
  const doneOfProduct = unit
    ? session.units.filter((u) => u.productId === unit.productId).length
    : 0;
  const order = unit?.orderId ? orders.find((o) => o.id === unit.orderId) : undefined;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <section className="flex flex-col gap-4">
        <ScanField
          label={t("ws.run.scan")}
          status={feedback?.status ?? "idle"}
          hint={
            feedback?.key.startsWith("ws.run.not_in_tote")
              ? undefined
              : feedback
                ? t(feedback.key, { name: feedback.name ?? "", box: feedback.box ?? "" })
                : t("ws.run.nextHint")
          }
          actionLabel={t(label ? "ws.act.confirm" : "ws.act.pack")}
          onSubmit={(c) => void onScan(c)}
        />

        {feedback?.key.startsWith("ws.run.not_in_tote") && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border-2 border-destructive bg-destructive/10 p-4"
          >
            <UserRound className="mt-0.5 size-6 shrink-0 text-destructive" />
            <p className="text-lg font-semibold leading-snug">
              {t(feedback.key, { name: feedback.name ?? "", box: feedback.box ?? "" })}
            </p>
          </div>
        )}

        <LastItem session={session} open={showLast} onToggle={() => setShowLast((v) => !v)} />

        {unit && product ? (
          <div className={card({ className: "flex flex-col gap-4" })}>
            <div className="flex items-start gap-4">
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt=""
                  className="size-24 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <span className="flex size-24 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Package className="size-10" />
                </span>
              )}
              <div className="min-w-0">
                <p className="text-3xl font-semibold leading-tight tracking-tight">
                  {product.name}
                </p>
                <p className="mt-1 font-mono text-base text-muted-foreground">{product.sku}</p>
                <p className="mt-2 text-xl font-semibold tabular-nums">
                  {t("ws.run.unitOf", { i: doneOfProduct, n: contents.get(product.id) ?? 0 })}
                </p>
                {order && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("ws.run.forOrder", { id: shortId(order.id), target: order.target ?? "—" })}
                  </p>
                )}
              </div>
            </div>
            <LabelBlock
              code={unit.labelCode}
              title={t("ws.run.labelPrinted")}
              lines={[product.name, order ? shortId(order.id) : product.sku]}
            />
            <Button
              variant="outline"
              className="self-start hover:border-destructive hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => void workstationRepository.packReject()}
            >
              <Ban />
              {t("ws.run.defect")}
            </Button>
          </div>
        ) : orderLabel ? (
          <div className={card({ className: "flex flex-col gap-4" })}>
            <p className="text-2xl font-semibold">
              {t("ws.run.orderLabel", { id: shortId(orderLabel.orderId) })}
            </p>
            <p className="text-sm text-muted-foreground">{t("ws.run.orderLabelHint")}</p>
            <LabelBlock
              code={orderLabel.labelCode}
              title={t("ws.run.labelPrinted")}
              lines={[orders.find((o) => o.id === orderLabel.orderId)?.target ?? "—"]}
            />
          </div>
        ) : (
          <div
            className={card({
              className: "flex min-h-40 flex-col items-center justify-center gap-2 text-center",
            })}
          >
            <p className="text-2xl font-semibold">{t("ws.run.next")}</p>
            <p className="text-sm text-muted-foreground">{t("ws.run.nextHint")}</p>
          </div>
        )}
      </section>

      <aside className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-2">
          <Stat label={t("ws.run.packed")} value={String(summary.packed)} />
          <Stat
            label={t("ws.run.avg")}
            value={
              summary.avgMs == null ? "—" : t("ws.run.sec", { n: Math.round(summary.avgMs / 1000) })
            }
          />
          <Stat
            label={t("ws.run.defects")}
            value={String(summary.defects)}
            tone={summary.defects > 0}
          />
          <Stat
            label={t("ws.run.errors")}
            value={String(summary.errors)}
            tone={summary.errors > 0}
          />
        </dl>

        <div className="flex flex-col gap-1.5">
          <h3 className={eyebrow({ tone: "muted", size: "xs" })}>
            {t("ws.run.tote")} · <span className="font-mono normal-case">{box.barcode}</span>
          </h3>
          <ul className={card({ pad: "none", className: "divide-y divide-border" })}>
            {[...contents].map(([id, total]) => {
              const left = remaining.get(id) ?? 0;
              return (
                <li
                  key={id}
                  className="grid grid-cols-[minmax(0,1fr)_4rem] gap-2 px-3 py-2 text-sm"
                >
                  <span
                    className={cn("truncate", left === 0 && "text-muted-foreground line-through")}
                  >
                    {nameOf(id)}
                  </span>
                  <span className="text-right tabular-nums">
                    {total - left} / {total}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex flex-col gap-1.5">
          <h3 className={eyebrow({ tone: "muted", size: "xs" })}>{t("ws.run.orders")}</h3>
          {orders.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("ws.run.ordersNone")}</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {orders.map((o) => {
                const packed = session.units.filter(
                  (u) => u.orderId === o.id && u.confirmedAt,
                ).length;
                return (
                  <li key={o.id} className="grid grid-cols-[minmax(0,1fr)_4rem] gap-2">
                    <span className="truncate">
                      {shortId(o.id)} · {o.target ?? "—"}
                    </span>
                    <span className="text-right tabular-nums">
                      {packed} / {o.units}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <Button
          size="lg"
          variant={summary.shortage > 0 ? "outline" : "default"}
          className={cn(
            summary.shortage > 0 && "hover:border-amber-500 hover:bg-amber-500 hover:text-white",
          )}
          disabled={!!label}
          onClick={() => void finish()}
        >
          {summary.shortage > 0
            ? t("ws.run.finishShort", { n: summary.shortage })
            : t("ws.run.finish")}
        </Button>
        <p className="font-mono text-xs text-muted-foreground">→ {session.targetCode}</p>
      </aside>
    </div>
  );
}

function feedbackFor(r: ItemScan, nameOf: (id: string) => string): Feedback {
  // Удачный скан говорит сам за себя: товар крупно и этикетка рядом.
  if (r.kind === "ok") return null;
  if (r.kind === "not_in_tote" || r.kind === "extra")
    return { status: "error", key: `ws.run.${r.kind}`, name: nameOf(r.productId) };
  return { status: "error", key: `ws.run.${r.kind}` };
}

/**
 * Этикетка, которая «вышла из принтера». Принтер ещё не подключён: печать идёт
 * окном браузера, а код этикетки виден крупно — его и сканируют после того, как
 * наклеили. С подключённым принтером она будет печататься сама, без кнопки.
 */
function LabelBlock({ code, title, lines }: { code: string; title: string; lines: string[] }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-primary p-3">
      <p className="flex items-center gap-2 text-sm font-medium text-primary">
        <Tag className="size-4" />
        {title}
      </p>
      <div className="flex items-center gap-4">
        <div className="rounded bg-white p-2 text-black">
          <QrSvg code={code} size={88} />
        </div>
        <div className="min-w-0 text-sm">
          {lines.map((l) => (
            <p key={l} className="truncate">
              {l}
            </p>
          ))}
          <p className="mt-1 text-xs text-muted-foreground">{t("ws.run.printerOff")}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => window.print()}>
            <Printer />
            {t("ws.run.print")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: boolean }) {
  return (
    <div className={card({ pad: "sm" })}>
      <dt className={eyebrow({ tone: "muted", size: "xs" })}>{label}</dt>
      <dd className={cn("mt-0.5 text-lg font-semibold tabular-nums", tone && "text-destructive")}>
        {value}
      </dd>
    </div>
  );
}

/**
 * Последняя упакованная штука: упаковщик отвлёкся или не расслышал сигнал —
 * открыл и увидел, что именно и с какой этикеткой ушло в короб.
 */
function LastItem({
  session,
  open,
  onToggle,
}: {
  session: PackSession;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const products = useEditor((s) => s.products);
  const last = session.units.filter((u) => u.confirmedAt).at(-1);
  const product = last && products.find((p) => p.id === last.productId);
  return (
    <div className="flex flex-col gap-2">
      <Button variant="ghost" size="sm" className="self-start" onClick={onToggle}>
        <History />
        {open ? t("ws.run.lastHide") : t("ws.run.last")}
      </Button>
      {open &&
        (last && product ? (
          <div className={card({ pad: "sm", className: "flex items-center gap-4" })}>
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt=""
                className="size-16 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <span className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Package className="size-7" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold leading-tight">{product.name}</p>
              <p className="font-mono text-sm text-muted-foreground">{product.sku}</p>
              <p className="font-mono text-xs text-muted-foreground">{last.labelCode}</p>
            </div>
            <div className="rounded bg-white p-1.5">
              <QrSvg code={last.labelCode} size={56} showCode={false} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("ws.run.lastNone")}</p>
        ))}
    </div>
  );
}
