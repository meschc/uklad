import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  MapPin,
  Package,
  ScanLine,
} from "lucide-react";
import { useEditor } from "@/lib/store";
import { addressKey, formatAddress, parseAddress } from "@/lib/address";
import { stockAt, stockByProduct } from "@/lib/fulfillment";
import { normalizeCode, parseHonestSignMock } from "@/lib/barcode";
import type { CellAddress, FulfillmentRequest } from "@/lib/types";
import { useT, type TFunc } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScreenShell, EmptyState } from "./ScreenShell";
import { ScanField, type ScanStatus } from "./ScanField";

/**
 * Экран «Сборка» (п.8) — зеркало приёмки по духу, но с обратной строгостью:
 * здесь считается КАЖДАЯ единица, потому что на кону точная отгрузка по
 * конкретной заявке продавца, а не сверка партии в целом. Ручной ввод числа
 * этот шаг не заменяет.
 *
 * Момент смены статуса: заявка переходит в «в работе» в тот момент, когда
 * сборщик открывает её здесь (`startPicking`). До этого физически никто ничего
 * не делает, и список «Задания» показывает честную картину.
 */

type Step = "queue" | "place" | "items";

export function PickingScreen() {
  const t = useT();
  const requests = useEditor((s) => s.requests);
  const products = useEditor((s) => s.products);
  const warehouse = useEditor((s) => s.warehouse);
  const placements = useEditor((s) => s.placements);
  const boxes = useEditor((s) => s.boxes);
  const startPicking = useEditor((s) => s.startPicking);
  const recordPick = useEditor((s) => s.recordPick);
  const completeRequest = useEditor((s) => s.completeRequest);
  const goToView = useEditor((s) => s.goToView);

  const [step, setStep] = useState<Step>("queue");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [addr, setAddr] = useState<CellAddress | null>(null);
  const [scan, setScan] = useState<{ status: ScanStatus; msg?: string }>({
    status: "idle",
  });
  const [confirmPartial, setConfirmPartial] = useState(false);
  // Уже посчитанные уникальные единицы (серийники «Честного знака»): повторный
  // скан той же коробочки — самая частая ошибка сборщика, и она обязана быть
  // видимой, а не тихо увеличивать счётчик (п.21).
  const [seenSerials, setSeenSerials] = useState<Set<string>>(new Set());

  const stock = useMemo(
    () => stockByProduct(placements, boxes),
    [placements, boxes],
  );

  const queue = requests.filter(
    (r) => r.status === "new" || r.status === "in_progress",
  );
  const active = requests.find((r) => r.id === activeId) ?? null;
  const product = active
    ? products.find((p) => p.id === active.productId)
    : undefined;
  const picked = active?.pickedQty ?? 0;

  const fail = (key: string, vars?: Record<string, string | number>) =>
    setScan({ status: "error", msg: t(key, vars) });
  const ok = (key: string, vars?: Record<string, string | number>) =>
    setScan({ status: "ok", msg: t(key, vars) });

  const open = (r: FulfillmentRequest) => {
    startPicking(r.id);
    setActiveId(r.id);
    setAddr(null);
    setScan({ status: "idle" });
    setSeenSerials(new Set());
    setStep("place");
  };

  const backToQueue = () => {
    setActiveId(null);
    setAddr(null);
    setScan({ status: "idle" });
    setSeenSerials(new Set());
    setStep("queue");
  };

  // --- 8.2 скан места: ярлык ячейки ИЛИ штрихкод самой коробки ---------------

  const onScanPlace = (raw: string) => {
    if (!active) return;
    const code = normalizeCode(raw);
    const box = boxes.find((b) => normalizeCode(b.barcode) === code);
    const parsed = box?.address ?? parseAddress(warehouse, raw);
    if (!parsed) {
      fail("pick.place.unknown");
      return;
    }
    // Проверяем, что по данным здесь действительно лежит нужный товар.
    if (!stockAt(stock, active.productId, parsed)) {
      const where = stock.get(active.productId)?.locations[0];
      fail(
        where ? "pick.place.wrongWithHint" : "pick.place.wrong",
        where ? { addr: formatAddress(warehouse, where.addr) ?? "" } : undefined,
      );
      return;
    }
    setAddr(parsed);
    ok("pick.place.ok", { addr: formatAddress(warehouse, parsed) ?? "" });
    setStep("items");
  };

  // --- 8.3 поштучный скан товара --------------------------------------------

  const onScanItem = (raw: string) => {
    if (!active || !addr || !product) return;
    const code = normalizeCode(raw);
    const mark = parseHonestSignMock(raw);
    const matches =
      normalizeCode(product.barcode) === code ||
      normalizeCode(product.sku) === code ||
      (mark ? mark.gtin.endsWith(product.barcode.slice(1)) : false);
    if (!matches) {
      fail("pick.item.wrong", { sku: product.sku });
      return;
    }
    // Маркированная единица уникальна — второй скан того же серийника это не
    // «ещё одна штука», а промах мимо коробки.
    if (mark?.serial) {
      if (seenSerials.has(mark.serial)) {
        fail("pick.item.duplicate", { serial: mark.serial });
        return;
      }
      setSeenSerials((prev) => new Set(prev).add(mark.serial));
    }
    const before = active.pickedQty ?? 0;
    const now = recordPick(active.id, active.productId, addr);
    if (now === before) {
      fail("pick.item.empty");
      return;
    }
    if (now >= active.qty) {
      // 8.4 — собрано ровно запрошенное: заявка закрывается сама.
      completeRequest(active.id, false);
      ok("pick.item.completed", { n: now });
      setStep("queue");
      setActiveId(null);
      setAddr(null);
      return;
    }
    ok("pick.item.counted", { n: now, total: active.qty });
  };

  // --- рендер ----------------------------------------------------------------

  return (
    <ScreenShell
      title={t("pick.title")}
      subtitle={t("pick.subtitle")}
      actions={
        step !== "queue" && (
          <Button size="sm" variant="ghost" onClick={backToQueue}>
            <ArrowLeft className="size-3.5" />
            {t("pick.backToQueue")}
          </Button>
        )
      }
    >
      {scan.msg && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs",
            scan.status === "ok"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "border-destructive/40 bg-destructive/10 text-destructive",
          )}
          role="status"
        >
          {scan.status === "ok" ? (
            <Check className="size-3.5 shrink-0" />
          ) : (
            <AlertTriangle className="size-3.5 shrink-0" />
          )}
          {scan.msg}
        </div>
      )}

      {step === "queue" && (
        <>
          {queue.length === 0 ? (
            <EmptyState
              icon={<ScanLine className="size-5" />}
              title={t("pick.emptyTitle")}
              body={t("pick.emptyBody")}
              action={
                <Button size="sm" variant="outline" onClick={() => goToView("tasks")}>
                  {t("pick.toTasks")}
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-2">
              {queue.map((r) => {
                const p = products.find((x) => x.id === r.productId);
                const have = stock.get(r.productId)?.qty ?? 0;
                return (
                  <button
                    key={r.id}
                    onClick={() => open(r)}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3.5 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm font-bold">
                        {p?.sku ?? "—"}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {p?.name} ·{" "}
                        {r.truckDate
                          ? t("pick.shipDate", {
                              d: new Date(r.truckDate).toLocaleDateString(),
                            })
                          : t("pick.noShipDate")}
                        {r.note ? ` · ${r.note}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums">
                        {r.pickedQty ? `${r.pickedQty}/` : ""}
                        {r.qty}
                      </p>
                      <p
                        className={cn(
                          "text-[11px]",
                          have < r.qty ? "text-destructive" : "text-muted-foreground",
                        )}
                      >
                        {t("tasks.inStock", { n: have })}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {step !== "queue" && active && product && (
        <div className="flex flex-col gap-4">
          <RequestHeader
            name={product.name}
            sku={product.sku}
            picked={picked}
            total={active.qty}
            addr={addr ? (formatAddress(warehouse, addr) ?? undefined) : undefined}
            t={t}
          />

          {step === "place" && (
            <>
              <ScanField
                label={t("pick.place.label")}
                hint={t("pick.place.hint")}
                status={scan.status}
                minLength={3}
                onSubmit={onScanPlace}
              />
              <SuggestedPlaces
                locations={stock.get(active.productId)?.locations ?? []}
                onPick={(a) => {
                  setAddr(a);
                  ok("pick.place.ok", { addr: formatAddress(warehouse, a) ?? "" });
                  setStep("items");
                }}
                t={t}
              />
            </>
          )}

          {step === "items" && (
            <>
              <ScanField
                label={t("pick.item.label")}
                status={scan.status}
                onSubmit={onScanItem}
              />
              {/* 8.4 — не тупик: если физически не хватает, есть явный выход. */}
              {confirmPartial ? (
                <div className="hazard-stripes flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                  <p className="text-xs font-semibold">
                    {t("pick.partial.confirm", {
                      picked,
                      total: active.qty,
                    })}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        completeRequest(active.id, true);
                        setConfirmPartial(false);
                        backToQueue();
                      }}
                    >
                      <CheckCircle2 className="size-3.5" />
                      {t("pick.partial.yes")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmPartial(false)}
                    >
                      {t("common.cancel")}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="self-start"
                  onClick={() => setConfirmPartial(true)}
                >
                  {t("pick.partial.start")}
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </ScreenShell>
  );
}

function RequestHeader({
  name,
  sku,
  picked,
  total,
  addr,
  t,
}: {
  name: string;
  sku: string;
  picked: number;
  total: number;
  addr?: string;
  t: TFunc;
}) {
  const pct = total ? Math.round((picked / total) * 100) : 0;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* Собирают по артикулу, а не по названию — он и главный (п.23). */}
          <p className="font-mono text-lg font-bold tracking-tight">{sku}</p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {name}
          </p>
          {addr && (
            <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary">
              <MapPin className="size-3" />
              {addr}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl font-bold tabular-nums">
            {picked}
            <span className="text-base font-medium text-muted-foreground">
              /{total}
            </span>
          </p>
          <p className="text-[11px] text-muted-foreground">{t("pick.counted")}</p>
        </div>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Подсказка «где лежит»: сканировать удобнее, но идти надо в правильный ряд. */
function SuggestedPlaces({
  locations,
  onPick,
  t,
}: {
  locations: { addr: CellAddress; qty: number; boxBarcode?: string }[];
  onPick: (addr: CellAddress) => void;
  t: TFunc;
}) {
  const warehouse = useEditor((s) => s.warehouse);
  if (!locations.length) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-destructive">
        <Package className="size-3.5" />
        {t("pick.noStock")}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t("pick.where")}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {locations.map((l) => (
          <button
            key={addressKey(l.addr) + (l.boxBarcode ?? "")}
            onClick={() => onPick(l.addr)}
            className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs transition-colors hover:border-primary/40 hover:bg-accent"
          >
            <MapPin className="size-3 text-muted-foreground" />
            <span className="font-mono">{formatAddress(warehouse, l.addr)}</span>
            <span className="tabular-nums text-muted-foreground">× {l.qty}</span>
            {l.boxBarcode && (
              <span className="font-mono text-[10px] text-muted-foreground">
                {l.boxBarcode}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
