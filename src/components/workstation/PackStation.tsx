import { useMemo, useState } from "react";
import { ArrowLeft, Camera, Check, CheckCircle2, Package, Printer } from "lucide-react";
import { useEditor } from "@/lib/store";
import { workstationRepository } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import {
  checkPackScan,
  isPackComplete,
  packPlan,
  packQueue,
  shiftState,
  type PackOrder,
} from "@/lib/workstation";
import { useT, type MsgKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { card } from "@/components/ui/card";
import { eyebrow } from "@/components/ui/eyebrow";
import { QrSvg } from "@/components/table/QrSvg";
import { EmptyState } from "@/components/fulfillment/ScreenShell";
import { ScanField, type ScanStatus } from "@/components/fulfillment/ScanField";
import { shortId } from "./useNow";

/**
 * Стол упаковки: очередь собранных заказов → заказ со сверкой сканом →
 * этикетка на коробку. Закрыть заказ можно только когда каждая позиция
 * положена ровно в нужном количестве — «почти всё» упаковщик не закрывает,
 * как сборщик не закрывает «почти собранное» без явной отметки.
 */
export function PackStation({
  staffId,
  onNeedShift,
}: {
  staffId: string;
  onNeedShift: () => void;
}) {
  const t = useT();
  const requests = useEditor((s) => s.requests);
  const events = useEditor((s) => s.staffEvents);
  const queue = useMemo(() => packQueue(requests), [requests]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [closed, setClosed] = useState<PackOrder | null>(null);

  const onShift = shiftState(events, staffId) === "on";
  const order = queue.find((o) => o.id === openId) ?? null;

  if (closed) {
    return (
      <PackLabel
        order={closed}
        onNext={() => {
          setClosed(null);
          setOpenId(null);
        }}
      />
    );
  }
  if (order) {
    return (
      <PackOrderView
        order={order}
        onBack={() => setOpenId(null)}
        onClosed={() => setClosed(order)}
      />
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className={eyebrow({ tone: "muted" })}>{t("ws.pack.queue")}</h2>
      {!onShift && (
        <div className={card({ pad: "sm", className: "flex items-center justify-between gap-3" })}>
          <p className="text-sm text-muted-foreground">{t("ws.shiftFirst")}</p>
          <Button size="sm" onClick={onNeedShift}>
            {t("ws.tab.shift")}
          </Button>
        </div>
      )}
      {queue.length === 0 ? (
        <EmptyState
          icon={<Package className="size-5" />}
          title={t("ws.pack.empty")}
          body={t("ws.pack.emptyBody")}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {queue.map((o) => (
            <li key={o.id} className={card({ pad: "sm", className: "flex items-center gap-3" })}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t("ws.pack.order", { id: shortId(o.id) })}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {o.target ?? t("ws.pack.noTarget")}
                </p>
              </div>
              <span className="w-16 whitespace-nowrap text-right text-sm tabular-nums">
                {t("ws.pack.units", { n: o.units })}
              </span>
              <Button size="sm" disabled={!onShift} onClick={() => setOpenId(o.id)}>
                {t("ws.pack.take")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type Feedback = { status: ScanStatus; key: MsgKey; name?: string } | null;

function PackOrderView({
  order,
  onBack,
  onClosed,
}: {
  order: PackOrder;
  onBack: () => void;
  onClosed: () => void;
}) {
  const t = useT();
  const products = useEditor((s) => s.products);
  const [packed, setPacked] = useState<Map<string, number>>(() => new Map());
  const [feedback, setFeedback] = useState<Feedback>(null);
  const pack = useCommand(workstationRepository.pack);

  const plan = packPlan(order);
  const complete = isPackComplete(order, packed);
  const nameOf = (id: string) => products.find((p) => p.id === id)?.name ?? id;

  const onScan = (code: string) => {
    const res = checkPackScan(order, packed, products, code);
    const isOk = res.kind === "ok";
    void workstationRepository.logScan(order.id, code, isOk);
    if (res.kind === "ok") {
      setPacked((m) => new Map(m).set(res.productId, (m.get(res.productId) ?? 0) + 1));
      setFeedback({ status: "ok", key: "ws.pack.ok", name: nameOf(res.productId) });
    } else if (res.kind === "unknown") {
      setFeedback({ status: "error", key: "ws.pack.unknown" });
    } else {
      setFeedback({
        status: "error",
        key: res.kind === "extra" ? "ws.pack.extra" : "ws.pack.wrong",
        name: nameOf(res.productId),
      });
    }
  };

  const close = async () => {
    const res = await pack.run(
      order.id,
      order.requests.map((r) => r.id),
    );
    if (res.ok) onClosed();
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft />
          {t("ws.pack.back")}
        </Button>
        <div className="min-w-0">
          <p className="text-base font-semibold">{t("ws.pack.order", { id: shortId(order.id) })}</p>
          <p className="truncate text-xs text-muted-foreground">
            {order.target ?? t("ws.pack.noTarget")}
          </p>
        </div>
      </div>

      <ScanField
        label={t("ws.pack.scan")}
        hint={feedback ? t(feedback.key, { name: feedback.name ?? "" }) : t("ws.pack.scanHint")}
        status={feedback?.status ?? "idle"}
        disabled={complete}
        onSubmit={onScan}
      />

      <ul className={card({ pad: "none", className: "divide-y divide-border" })}>
        {[...plan].map(([id, need]) => {
          const have = packed.get(id) ?? 0;
          const done = have >= need;
          const p = products.find((x) => x.id === id);
          return (
            <li
              key={id}
              className="grid grid-cols-[1.25rem_minmax(0,1fr)_4.5rem] items-center gap-3 px-4 py-2.5"
            >
              {done ? (
                <Check className="size-4 text-emerald-500" />
              ) : (
                <span className="size-4 rounded-full border border-border" />
              )}
              <div className="min-w-0">
                <p className="truncate text-sm">{p?.name ?? id}</p>
                <p className="font-mono text-xs text-muted-foreground">{p?.sku}</p>
              </div>
              <span className={cn("text-right text-sm tabular-nums", done && "text-emerald-600")}>
                {have} / {need}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Camera className="mt-0.5 size-3.5 shrink-0" />
        {t("ws.pack.camera")}
      </p>

      <Button size="lg" disabled={!complete || pack.pending} onClick={() => void close()}>
        <CheckCircle2 />
        {t("ws.pack.done")}
      </Button>
      {pack.error && <p className="text-sm text-destructive">{t(pack.error)}</p>}
    </section>
  );
}

/**
 * Этикетка на коробку. Принтер этикеток ещё не подключён, поэтому печать идёт
 * через окно браузера — тот же путь, что у ярлыков тары.
 */
function PackLabel({ order, onNext }: { order: PackOrder; onNext: () => void }) {
  const t = useT();
  return (
    <section className="flex flex-col items-center gap-4">
      <p className="flex items-center gap-2 text-base font-semibold">
        <CheckCircle2 className="size-5 text-emerald-500" />
        {t("ws.pack.closed", { id: shortId(order.id) })}
      </p>
      <div
        className={card({
          className: "flex w-full max-w-sm items-center gap-4 bg-white text-black",
        })}
      >
        <QrSvg code={`UK-ORD-${order.id}`} size={96} showCode={false} />
        <div className="min-w-0">
          <p className={eyebrow({ size: "xs" })}>{t("ws.pack.label")}</p>
          <p className="text-lg font-semibold">{shortId(order.id)}</p>
          <p className="text-sm">{order.target ?? t("ws.pack.noTarget")}</p>
          <p className="text-sm tabular-nums">{t("ws.pack.units", { n: order.units })}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => window.print()}>
          <Printer />
          {t("ws.pack.print")}
        </Button>
        <Button onClick={onNext}>{t("ws.pack.next")}</Button>
      </div>
    </section>
  );
}
