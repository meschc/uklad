import { useEffect, useRef, useState } from "react";
import { Ban, Check, History, Package, Printer, Tag, TriangleAlert, UserRound } from "lucide-react";
import { useEditor } from "@/lib/store";
import { workstationRepository } from "@/lib/data";
import {
  boxesHolding,
  cancelledInTote,
  explainScan,
  packSummary,
  pendingLabel,
  targetCode,
  toteContents,
  toteOrders,
  packedForCancelled,
  toteShortage,
  type ItemScan,
} from "@/lib/packing";
import type { PackSession } from "@/lib/types";
import { useT, type MsgKey } from "@/lib/i18n";
import { sizeLabel, useLabelPrinter } from "@/lib/labelPrinter";
import { beepNotes } from "@/lib/beep";
import { holdSignal, levelFor, signal } from "@/lib/scanSignal";
import { destinationMark } from "@/lib/destinationMark";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { eyebrow } from "@/components/ui/eyebrow";
import { QrSvg } from "@/components/table/QrSvg";
import { ScanField, type ScanStatus } from "@/components/fulfillment/ScanField";
import { Modal } from "@/components/fulfillment/Modal";
import { PrintableLabel } from "./PrintableLabel";
import { shortId } from "./useNow";
import { useDemoHints } from "./useDemoHints";
import { DestinationChip } from "./DestinationChip";

export type PackResult = ReturnType<typeof packSummary> & { source: string; target: string };

type Feedback = {
  status: ScanStatus;
  key: MsgKey;
  name?: string;
  box?: string;
  order?: string;
} | null;

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
  const demoHints = useDemoHints();
  const t = useT();
  const products = useEditor((s) => s.products);
  const requests = useEditor((s) => s.requests);
  const box = useEditor((s) => s.boxes.find((b) => b.id === session.sourceBoxId));
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [showLast, setShowLast] = useState(false);
  const [closing, setClosing] = useState(false);
  // Недостача идёт к старшему, а не оформляется сама: сначала показываем, чего нет.
  const [handoff, setHandoff] = useState(false);
  // Брак — решение про учёт: переспрашиваем в панели справа (класс `confirm`).
  const [rejecting, setRejecting] = useState(false);
  // Зелёная вспышка «принято»: гаснет сама, ошибка остаётся до следующего скана.
  const [okText, setOkText] = useState<string | null>(null);
  const okTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(okTimer.current), []);
  const flashOk = (text: string, quiet = false) => {
    signal("ok", { quiet });
    setFeedback(null);
    setOkText(text);
    window.clearTimeout(okTimer.current);
    okTimer.current = window.setTimeout(() => setOkText(null), 2200);
  };
  const flashError = (f: NonNullable<Feedback>) => {
    const level = levelFor(f.key);
    signal(level);
    f = { ...f, status: level };
    window.clearTimeout(okTimer.current);
    setOkText(null);
    setFeedback(f);
  };

  // Заказ из нескольких штук собран не весь — долгий жёлтый, пока не наполнится.
  const partial = !!box && orderIncomplete(session, toteOrders(requests, box));
  useEffect(() => {
    holdSignal(partial ? "warn" : null);
    return () => holdSignal(null);
  }, [partial]);

  if (!box) return null;
  const contents = toteContents(box);
  const cancelled = cancelledInTote(requests, box);
  const remaining = toteShortage(session, box, cancelled);
  const orders = toteOrders(requests, box);
  // Заказ отменили, пока тара на столе: его штуки нужно вынуть из короба.
  const pulled = packedForCancelled(session, cancelled).filter((u) => u.confirmedAt);
  const label = pendingLabel(session);
  const unit = session.units.find((u) => !u.confirmedAt);
  const orderLabel = !unit ? session.orderLabels.find((l) => !l.confirmedAt) : undefined;
  const summary = packSummary(session, box, cancelled);
  // Назначение короба отгрузки этой сессии: короб один на адрес (`targetCode`).
  const dest = orders.find((o) => o.target && targetCode(o.target) === session.targetCode)?.target;
  const nameOf = (id: string) => products.find((p) => p.id === id)?.name ?? id;

  const onScan = async (code: string) => {
    if (closing) {
      // Закрытие подтверждается сканом короба: упакованное не уедет в чужой.
      if (code.trim().toUpperCase() === session.targetCode.toUpperCase()) return void finish();
      return flashError({ status: "error", key: "ws.chk.closeWrong", box: session.targetCode });
    }
    const mistake = explainScan(session, box, products, code);
    if (mistake) return flashError({ status: "error", key: `ws.chk.${mistake}` });
    if (label) {
      const res = await workstationRepository.packLabel(code);
      if (res.ok) {
        // Свой звук назначения: на слух ясно, в какой короб класть.
        if (dest) beepNotes(destinationMark(dest).notes);
        return flashOk(t("ws.ok.label"), !!dest);
      }
      // Не этикетка, а товар — значит, этикетку ещё не наклеили.
      const item = await workstationRepository.packItem(code);
      return flashError({
        status: "error",
        key:
          item.ok && item.data.kind === "label_pending" ? "ws.run.label_pending" : "ws.label.wrong",
      });
    }
    const res = await workstationRepository.packItem(code);
    if (!res.ok) return flashError({ status: "error", key: res.error });
    if (res.data.kind === "not_in_tote") {
      const where = boxesHolding(useEditor.getState().boxes, res.data.productId, box.id);
      return flashError({
        status: "error",
        key: where.length ? "ws.run.not_in_tote" : "ws.run.not_in_toteNowhere",
        name: nameOf(res.data.productId),
        box: where.slice(0, 3).join(", ") + (where.length > 3 ? " …" : ""),
      });
    }
    const fb = feedbackFor(res.data, nameOf);
    if (fb) return flashError(fb);
    flashOk(t("ws.ok.item", { name: nameOf((res.data as { productId: string }).productId) }));
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

  const idleText = closing ? t("ws.idle.close") : label ? t("ws.idle.label") : t("ws.idle.item");
  const missing = [...remaining].filter(([, n]) => n > 0);
  // Жёлтое (не тот порядок, лишняя штука) показываем так же, как ошибку, но
  // своим цветом: рамка стола и полоса горят одинаково.
  const isError = feedback?.status === "error" || feedback?.status === "warn";
  const warn = feedback?.status === "warn";
  const bannerText = isError
    ? t(feedback.key, fbVars(feedback))
    : okText
      ? okText
      : feedback
        ? t(feedback.key, fbVars(feedback))
        : idleText;

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3">
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <ScanField
              label={t("ws.run.scan")}
              status={isError ? (warn ? "warn" : "error") : okText ? "ok" : "idle"}
              actionLabel={t(label ? "ws.act.confirm" : "ws.act.pack")}
              onSubmit={(c) => void onScan(c)}
            />
          </div>
          {/* На телефоне — только значок: подпись съела бы поле скана. */}
          <Button
            variant="ghost"
            className="shrink-0 max-md:px-2.5"
            aria-label={showLast ? t("ws.run.lastHide") : t("ws.run.last")}
            onClick={() => setShowLast((v) => !v)}
          >
            <History />
            <span className="hidden md:inline">
              {showLast ? t("ws.run.lastHide") : t("ws.run.last")}
            </span>
          </Button>
        </div>

        {/* Результат скана читается краем глаза: зелёное — принято, красное —
            стоп. Текст дублирует цвет для тех, кто всё же смотрит. */}
        <div
          role={isError ? "alert" : "status"}
          className={cn(
            "flex min-h-14 items-center gap-3 rounded-xl px-4 py-3 text-xl font-semibold transition-colors duration-200",
            isError
              ? warn
                ? "bg-warning text-black"
                : "bg-destructive text-destructive-foreground"
              : okText
                ? "bg-success text-white"
                : "bg-muted text-muted-foreground",
          )}
        >
          {isError ? (
            feedback.key.startsWith("ws.run.not_in_tote") ? (
              <UserRound className="size-6 shrink-0" />
            ) : (
              <TriangleAlert className="size-6 shrink-0" />
            )
          ) : okText ? (
            <Check className="size-6 shrink-0" />
          ) : null}
          <span className="min-w-0 leading-snug">{bannerText}</span>
        </div>

        {showLast && <LastItemPanel session={session} />}

        {demoHints && (
          <DemoCodes
            codes={
              closing
                ? [{ code: session.targetCode, hint: t("ws.demo.target") }]
                : label
                  ? [{ code: label, hint: t("ws.demo.label") }]
                  : [...remaining.keys()].map((id) => ({
                      code: products.find((p) => p.id === id)?.barcode ?? id,
                      hint: nameOf(id),
                    }))
            }
            onScan={(c) => void onScan(c)}
          />
        )}

        {unit && product ? (
          <div key={unit.labelCode} className="ws-in grid gap-6 pt-2 md:grid-cols-[3fr_2fr]">
            {/* Картинка крупно: упаковщик сверяет, что в руках то же, что на фото. */}
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt=""
                className="aspect-square max-h-[36rem] w-full rounded-xl object-cover"
              />
            ) : (
              <span className="flex aspect-square max-h-[36rem] w-full items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Package className="size-32" />
              </span>
            )}
            <div className="flex min-w-0 flex-col gap-3">
              {/* Название с площадки бывает огромным: не больше трёх строк, полное —
                  в подсказке. Главное на экране — картинка. */}
              <p
                title={product.name}
                className="line-clamp-3 break-words text-xl font-semibold leading-snug md:text-2xl"
              >
                {product.name}
              </p>
              <p className="font-mono text-base text-muted-foreground">{product.sku}</p>
              <p className="text-3xl font-semibold tabular-nums">
                {t("ws.run.unitOf", { i: doneOfProduct, n: contents.get(product.id) ?? 0 })}
              </p>
              {order && (
                <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  {t("ws.run.forOrder", { id: shortId(order.id) })}
                  {order.target && <DestinationChip destination={order.target} />}
                </p>
              )}
              <div className="mt-auto flex flex-col items-start gap-3">
                <LabelBlock code={unit.labelCode} title={t("ws.run.labelPrinted")} />
                {/* Брак — средняя по опасности: жёлтая, красная оставлена для необратимого. */}
                <Button
                  className="bg-warning text-black shadow-sm hover:bg-warning"
                  onClick={() => setRejecting(true)}
                >
                  <Ban />
                  {t("ws.run.defect")}
                </Button>
              </div>
            </div>
          </div>
        ) : orderLabel ? (
          <div key={orderLabel.labelCode} className="ws-in flex flex-col gap-4 pt-2">
            <p className="text-2xl font-semibold">
              {t("ws.run.orderLabel", { id: shortId(orderLabel.orderId) })}
            </p>
            <p className="text-sm text-muted-foreground">{t("ws.run.orderLabelHint")}</p>
            <LabelBlock code={orderLabel.labelCode} title={t("ws.run.labelPrinted")} />
          </div>
        ) : (
          <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-center">
            <p className="text-2xl font-semibold">{t("ws.run.next")}</p>
          </div>
        )}
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <h3 className={eyebrow({ tone: "muted", size: "xs" })}>
            {t("ws.run.tote")} · <span className="font-mono normal-case">{box.barcode}</span>
          </h3>
          <ul className="flex flex-col divide-y divide-border">
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
      </div>

      {pulled.length > 0 && (
        <div role="alert" className="flex items-start gap-2 rounded-xl bg-destructive/10 p-4">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
          <p className="text-sm">
            <span className="font-semibold">
              {t("ws.run.cancelledPacked", {
                id: shortId(pulled[0].orderId ?? ""),
                n: pulled.length,
              })}
            </span>{" "}
            {t("ws.run.cancelledPackedHint", { box: box.barcode })}
          </p>
        </div>
      )}

      {rejecting && unit && (
        <Modal
          title={t("ws.reject.title")}
          icon={<Ban className="size-4 text-muted-foreground" />}
          submitLabel={t("ws.run.defect")}
          onClose={() => setRejecting(false)}
          onSubmit={async () => {
            const res = await workstationRepository.packReject();
            setRejecting(false);
            if (res.ok) flashOk(t("ws.run.rejected", { name: nameOf(unit.productId) }), true);
          }}
        >
          <p className="text-base font-medium">{nameOf(unit.productId)}</p>
          <p className="text-sm">{t("ws.reject.body", { box: box.barcode })}</p>
          <p className="text-sm text-muted-foreground">{t("ws.reject.label")}</p>
        </Modal>
      )}

      {handoff && (
        <Modal
          title={t("ws.handoff.title")}
          icon={<TriangleAlert className="size-4 text-muted-foreground" />}
          submitLabel={t("ws.handoff.confirm")}
          onClose={() => setHandoff(false)}
          onSubmit={() => {
            setHandoff(false);
            setClosing(true);
            setFeedback({ status: "idle", key: "ws.chk.closeBody", box: session.targetCode });
          }}
        >
          <p className="text-sm">{t("ws.handoff.body", { box: box.barcode })}</p>
          <ul className="flex flex-col gap-1 text-base font-medium">
            {missing.map(([id, n]) => (
              <li key={id}>{t("ws.handoff.line", { name: nameOf(id), n })}</li>
            ))}
          </ul>
        </Modal>
      )}

      <footer className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-4">
        {/* Счётчики — второстепенное: упаковщик смотрит на товар, а не на цифры. */}
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
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
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <p className="text-xs text-muted-foreground">
            {t("ws.run.outTote")} <span className="font-mono">{session.targetCode}</span>
            {dest && <DestinationChip destination={dest} className="ml-2 text-xs" />}
          </p>
          <Button
            size="lg"
            variant={summary.shortage > 0 ? "outline" : "default"}
            className={cn(
              summary.shortage > 0 && "border-0 bg-warning text-white hover:bg-warning/90",
            )}
            disabled={!!label}
            onClick={() => {
              // Недостача: сначала старшему, потом закрытие.
              if (summary.shortage > 0) return setHandoff(true);
              setClosing(true);
              setFeedback({ status: "idle", key: "ws.chk.closeBody", box: session.targetCode });
            }}
          >
            {summary.shortage > 0
              ? t("ws.run.finishShort", { n: summary.shortage })
              : t("ws.run.finish")}
          </Button>
          {closing && (
            <Button
              variant="ghost"
              onClick={() => {
                setClosing(false);
                setFeedback(null);
              }}
            >
              {t("ws.chk.closeCancel")}
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}

function fbVars(f: NonNullable<Feedback>) {
  return { name: f.name ?? "", box: f.box ?? "", id: f.order ? shortId(f.order) : "" };
}

function feedbackFor(r: ItemScan, nameOf: (id: string) => string): Feedback {
  // Удачный скан говорит сам за себя: товар крупно и этикетка рядом.
  if (r.kind === "ok") return null;
  if (r.kind === "not_in_tote" || r.kind === "extra")
    return { status: "error", key: `ws.run.${r.kind}`, name: nameOf(r.productId) };
  if (r.kind === "cancelled")
    return {
      status: "error",
      key: "ws.run.cancelled",
      name: nameOf(r.productId),
      order: r.orderId,
    };
  return { status: "error", key: `ws.run.${r.kind}` };
}

/**
 * Этикетка, которая «вышла из принтера». Принтер ещё не подключён: печать идёт
 * окном браузера, а код виден мелко — на сервере этикетка печатается сама, и
 * картинку этикетки на экране показывать незачем.
 */
function LabelBlock({ code, title }: { code: string; title: string }) {
  const t = useT();
  const printer = useLabelPrinter();
  const size = sizeLabel(printer);
  return (
    <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 py-1 text-sm">
      <PrintableLabel code={code} lines={[]} printer={printer} />
      <Tag className="size-4 shrink-0 text-primary" />
      <span className="font-medium text-primary">{title}</span>
      <span className="font-mono text-xs text-muted-foreground">{code}</span>
      <Button variant="ghost" size="sm" className="ml-auto" onClick={() => window.print()}>
        <Printer />
        {t("ws.run.print")}
      </Button>
      <p className="basis-full text-xs text-muted-foreground">
        {printer.name
          ? t("ws.run.printerOn", { name: printer.name, size })
          : t("ws.run.printerSizeOnly", { size })}
      </p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt>{label}</dt>
      <dd className={cn("font-medium tabular-nums text-foreground", tone && "text-destructive")}>
        {value}
      </dd>
    </div>
  );
}

/**
 * Последняя упакованная штука: упаковщик отвлёкся или не расслышал сигнал —
 * открыл и увидел, что именно и с какой этикеткой ушло в короб.
 */
function LastItemPanel({ session }: { session: PackSession }) {
  const t = useT();
  const products = useEditor((s) => s.products);
  const last = session.units.filter((u) => u.confirmedAt).at(-1);
  const product = last && products.find((p) => p.id === last.productId);
  if (!last || !product) {
    return <p className="text-sm text-muted-foreground">{t("ws.run.lastNone")}</p>;
  }
  return (
    <div className="flex items-center gap-4">
      {product.imageUrl ? (
        <img src={product.imageUrl} alt="" className="size-16 shrink-0 rounded-lg object-cover" />
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
  );
}

/**
 * Демо-коды: сканера под рукой нет — клик по коду делает то же, что скан.
 * Показывает ровно то, что сейчас ждёт стол: товар из тары, напечатанную
 * этикетку или короб отгрузки при закрытии. На сервере плашки нет.
 */
function DemoCodes({
  codes,
  onScan,
}: {
  codes: { code: string; hint: string }[];
  onScan: (code: string) => void;
}) {
  const t = useT();
  if (codes.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{t("ws.demo.title")}</span> ·{" "}
        {t("ws.demo.hint")}
      </p>
      <ul className="flex flex-wrap gap-2">
        {codes.slice(0, 8).map(({ code, hint }) => (
          <li key={code}>
            <Button variant="outline" size="sm" onClick={() => onScan(code)} title={hint}>
              <span className="font-mono">{code}</span>
              <span className="max-w-40 truncate text-muted-foreground">{hint}</span>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Последний упакованный заказ ещё не полон: часть его штук впереди. */
function orderIncomplete(session: PackSession, orders: ReturnType<typeof toteOrders>): boolean {
  const last = session.units.filter((u) => u.confirmedAt).at(-1);
  const order = last?.orderId ? orders.find((o) => o.id === last.orderId) : undefined;
  if (!order) return false;
  return session.units.filter((u) => u.orderId === order.id && u.confirmedAt).length < order.units;
}
