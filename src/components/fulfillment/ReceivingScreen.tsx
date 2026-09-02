import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Box as BoxIcon,
  Check,
  CheckCircle2,
  Layers,
  MapPin,
  Package,
  Plus,
  SkipForward,
} from "lucide-react";
import { useEditor } from "@/lib/store";
import { addressKey, formatAddress, parseAddress } from "@/lib/address";
import { staffOptionLabel } from "@/lib/staff";
import { buildOccupancy, occupantsAt } from "@/lib/placement";
import {
  honestSignToEan13,
  normalizeCode,
  parseHonestSignMock,
} from "@/lib/barcode";
import type {
  CellAddress,
  Discrepancy,
  ExpectedShipment,
  Product,
} from "@/lib/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { QrSvg } from "@/components/table/QrSvg";
import { ProductDialog } from "@/components/table/ProductDialog";
import { ScreenShell } from "./ScreenShell";
import { ScanField, type ScanStatus } from "./ScanField";
import { ShipmentPicker } from "./ShipmentPicker";
import { QtyStepper } from "./QtyStepper";
import { DiscrepancyAlert } from "./DiscrepancyAlert";

/**
 * Экран «Приёмка» — последовательный мастер, а не форма с десятком полей.
 *
 * Порядок шагов (п.5): поставка → скан товара → фактическое количество со
 * сверкой → коробка → место → паллета (опционально) → снова скан товара.
 * Приёмка — это СВЕРКА партии: сканируется одна единица, чтобы опознать
 * артикул, количество вводится руками.
 */

/**
 * Порядок шагов повторяет физику работы на рампе (п.18): сначала под рукой
 * появляется паллета, на неё открывают тару, в тару кладут товар — и только
 * закрытая тара едет на место. Паллета необязательна: мелкую поставку
 * принимают сразу в тару.
 */
type Step = "shipment" | "pallet" | "box" | "product" | "qty" | "place";

interface Draft {
  product: Product;
  /** Строка активной поставки, если товар из неё. */
  lineId?: string;
  qty: number;
  discrepancy?: Discrepancy;
}

export function ReceivingScreen() {
  const t = useT();
  const products = useEditor((s) => s.products);
  const warehouse = useEditor((s) => s.warehouse);
  const placements = useEditor((s) => s.placements);
  const boxes = useEditor((s) => s.boxes);
  const pallets = useEditor((s) => s.pallets);
  const shipments = useEditor((s) => s.expectedShipments);
  const staff = useEditor((s) => s.warehouse.staff ?? []);

  const receiveProduct = useEditor((s) => s.receiveProduct);
  const createBox = useEditor((s) => s.createBox);
  const placeBox = useEditor((s) => s.placeBox);
  const createPallet = useEditor((s) => s.createPallet);
  const attachBoxToPallet = useEditor((s) => s.attachBoxToPallet);
  const closeShipment = useEditor((s) => s.closeShipment);
  const applyCrossDock = useEditor((s) => s.applyCrossDock);

  const [step, setStepRaw] = useState<Step>("shipment");
  const [shipmentId, setShipmentId] = useState<string | null>(null);
  const [staffId, setStaffId] = useState<string>("");
  const [draft, setDraft] = useState<Draft | null>(null);
  // Открытые тара и паллета держатся по id, а объекты берутся из стора: снимок
  // устаревал сразу после первой же записи товара, и плашка показывала «позиций
  // 0» у уже наполненной тары.
  const [boxId, setBoxId] = useState<string | null>(null);
  const [palletId, setPalletId] = useState<string | null>(null);
  const box = boxes.find((b) => b.id === boxId) ?? null;
  const pallet = pallets.find((p) => p.id === palletId) ?? null;
  const [scan, setScan] = useState<{ status: ScanStatus; msg?: string }>({
    status: "idle",
  });
  const [pendingDiscrepancy, setPendingDiscrepancy] = useState<{
    kind: Discrepancy;
    expected: number;
  } | null>(null);
  const [newProductCode, setNewProductCode] = useState<string | null>(null);
  const [received, setReceived] = useState(0);

  /**
   * Смена шага гасит подсветку скана. Иначе красная рамка и текст ошибки от
   * прошлого шага висели на новом пустом поле — интерфейс ругался на то, чего
   * человек ещё не вводил.
   */
  const setStep = (next: Step) => {
    setStepRaw(next);
    setScan({ status: "idle" });
  };

  const shipment: ExpectedShipment | undefined = shipments.find(
    (s) => s.id === shipmentId,
  );
  /** Кроссдок-поставка: шага «место» у неё нет вовсе (п.10.1). */
  const crossDock = !!shipment?.crossDock;
  const occupancy = useMemo(
    () => buildOccupancy(placements, boxes),
    [placements, boxes],
  );

  const fail = (msgKey: string, vars?: Record<string, string | number>) =>
    setScan({ status: "error", msg: t(msgKey, vars) });
  const ok = (msgKey: string, vars?: Record<string, string | number>) =>
    setScan({ status: "ok", msg: t(msgKey, vars) });

  /** Остаток по строке поставки для товара — «сколько ещё ждём». */
  const remainderFor = (productId: string) => {
    const line = shipment?.lines.find((l) => l.productId === productId);
    if (!line) return null;
    return {
      lineId: line.id,
      remainder: Math.max(0, line.expectedQty - line.receivedQty),
    };
  };

  // --- 5.2 скан товара -------------------------------------------------------

  const onScanProduct = (raw: string) => {
    const code = normalizeCode(raw);
    const product =
      products.find((p) => normalizeCode(p.barcode) === code) ??
      products.find((p) => normalizeCode(p.sku) === code);

    if (!product) {
      // Код не опознан ни в каталоге, ни в поставке — это неучтённый товар.
      // Считаем его кодом маркировки и заводим заготовку карточки (мок ЧЗ).
      const scanned = parseHonestSignMock(raw);
      setNewProductCode(honestSignToEan13(scanned));
      fail("recv.scan.unknown");
      return;
    }

    const line = remainderFor(product.id);
    if (shipment && !line) {
      // Товар есть в каталоге, но его нет в этой поставке — принимаем как
      // внеплановый, вне сверки.
      setDraft({ product, qty: 1 });
      ok("recv.scan.offPlan", { name: product.name });
      setStep("qty");
      return;
    }
    setDraft({
      product,
      lineId: line?.lineId,
      qty: line?.remainder && line.remainder > 0 ? line.remainder : 1,
    });
    ok("recv.scan.found", { name: product.name });
    setStep("qty");
  };

  // --- 5.3 количество со сверкой ---------------------------------------------

  const confirmQty = () => {
    if (!draft) return;
    const line = remainderFor(draft.product.id);
    if (!line || line.remainder === 0) {
      // Сверять не с чем — свободная приёмка.
      putInBox(draft);
      return;
    }
    if (draft.qty === line.remainder) {
      ok("recv.qty.match");
      putInBox(draft);
      return;
    }
    setPendingDiscrepancy({
      kind: draft.qty < line.remainder ? "shortage" : "overage",
      expected: line.remainder,
    });
  };

  // --- паллета (необязательный первый шаг) -----------------------------------

  const onScanPallet = (raw: string) => {
    const code = normalizeCode(raw);
    const found = pallets.find((p) => normalizeCode(p.barcode) === code);
    if (!found) {
      fail("recv.pallet.unknown");
      return;
    }
    setPalletId(found.id);
    ok("recv.pallet.opened", { code: found.barcode });
    setStep("box");
  };

  const onNewPallet = () => {
    const created = createPallet();
    setPalletId(created.id);
    ok("recv.pallet.created", { code: created.barcode });
    setStep("box");
  };

  // --- тара -------------------------------------------------------------------

  const onScanBox = (raw: string) => {
    const code = normalizeCode(raw);
    const found = boxes.find((b) => normalizeCode(b.barcode) === code);
    if (!found) {
      fail("recv.box.unknown");
      return;
    }
    if (found.address) {
      // Тара уже стоит на месте: открывать её заново — почти всегда промах
      // мимо нужного ярлыка, и молча доливать в неё товар нельзя.
      fail("recv.box.placed", { addr: formatAddress(warehouse, found.address) ?? "" });
      return;
    }
    setBoxId(found.id);
    ok("recv.box.opened", { code: found.barcode });
    setStep("product");
  };

  const onNewBox = () => {
    const created = createBox();
    setBoxId(created.id);
    ok("recv.box.created", { code: created.barcode });
    setStep("product");
  };

  /** Товар уезжает в открытую тару; тара пока стоит на рампе, без адреса. */
  const putInBox = (d: Draft) => {
    if (!box) return;
    receiveProduct({
      productId: d.product.id,
      qty: d.qty,
      boxId: box.id,
      shipmentId: shipment?.id,
      lineId: d.lineId,
      staffId: staffId || undefined,
      discrepancy: d.discrepancy,
    });
    setReceived((n) => n + d.qty);

    // Кроссдокинг (п.10.1): товар не поедет на полку — он тут же закрывает
    // заявки, которые его ждали. Что не разошлось по заявкам, останется в таре
    // и поедет на место обычным путём.
    if (crossDock) {
      const used = applyCrossDock(d.product.id, d.qty, shipment?.id);
      ok(used > 0 ? "recv.crossDock.sent" : "recv.crossDock.noRequests", {
        name: d.product.name,
        n: used,
      });
      nextProduct();
      return;
    }

    ok("recv.box.added", { name: d.product.name, n: d.qty, code: box.barcode });
    nextProduct();
  };

  /**
   * Кроссдок-тара уезжает в зону отгрузки без адреса: она физически не
   * хранится, и в занятость (`buildOccupancy`) попадать не должна.
   */
  const closeCrossDockBox = () => {
    if (!box) return;
    if (pallet) attachBoxToPallet(box.id, pallet.id);
    ok("recv.crossDock.closed", { code: box.barcode });
    setBoxId(null);
    setDraft(null);
    setStep("box");
  };

  // --- закрытие тары: место -----------------------------------------------

  const onScanPlace = (raw: string) => {
    const addr = parseAddress(warehouse, raw);
    if (!addr) {
      fail("recv.place.unknown");
      return;
    }
    // Конфликт «занято другим» — тот же единый паттерн, что в редакторе:
    // не запрещаем, а показываем, кто там уже лежит.
    const inBox = new Set((box?.lines ?? []).map((l) => l.productId));
    const others = occupantsAt(occupancy, addr).filter((id) => !inBox.has(id));
    // Та же коробка на том же месте — не конфликт, а продолжение укладки.
    // Сравниваем по ключу ячейки, а не по строке адреса: у строки бывает null.
    const sameBox =
      !!box?.address && addressKey(box.address) === addressKey(addr);
    if (others.length && !sameBox) {
      const who = products.find((p) => p.id === others[0]);
      fail("recv.place.busy", { name: who?.name ?? t("recv.place.someone") });
      return;
    }
    commit(addr);
  };

  /** Закрытая тара едет на место; если есть паллета — привязываем к ней. */
  const commit = (addr: CellAddress) => {
    if (!box) return;
    placeBox(box.id, addr);
    if (pallet) attachBoxToPallet(box.id, pallet.id);
    ok("recv.place.done", { addr: formatAddress(warehouse, addr) ?? "" });
    setBoxId(null);
    setDraft(null);
    setStep("box");
  };

  /** 5.7 — следующий товар той же поставки, без лишнего клика. */
  const nextProduct = () => {
    setDraft(null);
    setPendingDiscrepancy(null);
    setScan({ status: "idle" });
    setStep("product");
  };

  /** Паллета уехала — следующая партия начинается с чистого листа. */
  const closePallet = () => {
    setPalletId(null);
    setBoxId(null);
    setDraft(null);
    ok("recv.pallet.closed");
    setStep("pallet");
  };

  // --- рендер ----------------------------------------------------------------

  const shipmentDone =
    shipment && shipment.lines.every((l) => l.receivedQty >= l.expectedQty);

  return (
    <ScreenShell
      title={t("recv.title")}
      subtitle={t("recv.subtitle")}
      actions={
        step !== "shipment" && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setStep("shipment");
              setDraft(null);
              setScan({ status: "idle" });
            }}
          >
            <ArrowLeft className="size-3.5" />
            {t("recv.changeShipment")}
          </Button>
        )
      }
    >
      {step !== "shipment" && (
        <Stepper
          step={step}
          hasShipment={!!shipment}
          crossDock={crossDock}
          t={t}
        />
      )}

      {/* Полоса состояния активной поставки */}
      {shipment && step !== "shipment" && (
        <ShipmentBar
          shipment={shipment}
          received={received}
          onClose={() => {
            closeShipment(shipment.id);
            setShipmentId(null);
            setStep("shipment");
          }}
          done={!!shipmentDone}
          t={t}
        />
      )}

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
            <Package className="size-3.5 shrink-0" />
          )}
          {scan.msg}
        </div>
      )}

      {step === "shipment" && (
        <div className="flex flex-col gap-4">
          <StaffPicker staff={staff} value={staffId} onChange={setStaffId} t={t} />
          <ShipmentPicker
            onPick={(id) => {
              setShipmentId(id);
              setReceived(0);
              setStep("pallet");
            }}
            onFreeform={() => {
              setShipmentId(null);
              setReceived(0);
              setStep("pallet");
            }}
          />
        </div>
      )}

      {step === "pallet" && (
        <div className="flex flex-col gap-4">
          <ScanField
            label={t("recv.pallet.label")}
            hint={t("recv.pallet.hint")}
            status={scan.status}
            onSubmit={onScanPallet}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={onNewPallet}>
              <Layers className="size-3.5" />
              {t("recv.pallet.new")}
            </Button>
            {/* Паллета необязательна: мелкую поставку принимают сразу в тару. */}
            <Button onClick={() => setStep("box")}>
              <SkipForward className="size-3.5" />
              {t("recv.pallet.skip")}
            </Button>
          </div>
        </div>
      )}

      {step === "box" && (
        <div className="flex flex-col gap-4">
          {pallet && <ActiveTag label={t("recv.pallet.active", { code: pallet.barcode })} />}
          <ScanField
            label={t("recv.box.label")}
            hint={t("recv.box.hint")}
            status={scan.status}
            onSubmit={onScanBox}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={onNewBox}>
              <Plus className="size-3.5" />
              {t("recv.box.new")}
            </Button>
            {pallet && (
              <Button onClick={closePallet}>
                <Layers className="size-3.5" />
                {t("recv.pallet.close")}
              </Button>
            )}
          </div>
        </div>
      )}

      {step === "product" && box && (
        <div className="flex flex-col gap-4">
          <ActiveTag label={t("recv.box.active", { code: box.barcode, n: box.lines.length })} />
          <ScanField
            label={t("recv.scan.label")}
            hint={t("recv.scan.hint")}
            status={scan.status}
            // Пока открыта карточка неучтённого товара, скан не должен
            // срабатывать за спиной у диалога.
            disabled={!!newProductCode}
            onSubmit={onScanProduct}
          />
          {/* Тара закрывается явно: только после этого у неё появляется адрес.
              У кроссдок-поставки адреса не будет вовсе — тара едет в отгрузку. */}
          <Button
            variant="outline"
            className="self-start"
            disabled={box.lines.length === 0}
            onClick={() => (crossDock ? closeCrossDockBox() : setStep("place"))}
          >
            <BoxIcon className="size-3.5" />
            {crossDock ? t("recv.crossDock.close") : t("recv.box.close")}
          </Button>
          {shipment && <ShipmentLines shipment={shipment} t={t} />}
        </div>
      )}

      {step === "qty" && draft && (
        <QtyStep
          draft={draft}
          remainder={remainderFor(draft.product.id)?.remainder ?? null}
          onQty={(qty) => setDraft({ ...draft, qty })}
          onConfirm={confirmQty}
          onBack={nextProduct}
          t={t}
        />
      )}

      {step === "place" && box && (
        <div className="flex flex-col gap-4">
          {/* Ярлык печатается ДО продолжения: коробку нужно подписать сразу. */}
          <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">
              {t("recv.box.label128")}
            </p>
            <QrSvg code={box.barcode} size={128} className="rounded-md p-3" />
          </div>
          <ScanField
            label={t("recv.place.label")}
            hint={t("recv.place.hint")}
            status={scan.status}
            minLength={3}
            onSubmit={onScanPlace}
          />
        </div>
      )}

      {pendingDiscrepancy && draft && (
        <DiscrepancyAlert
          productName={draft.product.name}
          expected={pendingDiscrepancy.expected}
          actual={draft.qty}
          kind={pendingDiscrepancy.kind}
          onRecheck={() => setPendingDiscrepancy(null)}
          onRecord={() => {
            setPendingDiscrepancy(null);
            putInBox({ ...draft, discrepancy: pendingDiscrepancy.kind });
          }}
        />
      )}

      {/* Неучтённый товар: заготовка карточки по коду маркировки (мок ЧЗ) */}
      {newProductCode && (
        <ProductDialog
          product={null}
          presetBarcode={newProductCode}
          onClose={() => setNewProductCode(null)}
        />
      )}
    </ScreenShell>
  );
}

// --- вспомогательные блоки ----------------------------------------------------

const STEPS: { id: Step; key: string; icon: typeof Package }[] = [
  { id: "pallet", key: "recv.step.pallet", icon: Layers },
  { id: "box", key: "recv.step.box", icon: BoxIcon },
  { id: "product", key: "recv.step.product", icon: Package },
  { id: "qty", key: "recv.step.qty", icon: CheckCircle2 },
  { id: "place", key: "recv.step.place", icon: MapPin },
];

/** Плашка «сейчас открыто»: паллета или тара, в которую идёт приёмка. */
function ActiveTag({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 self-start rounded-lg border border-primary/40 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary">
      <Layers className="size-3.5" />
      {label}
    </div>
  );
}

function Stepper({
  step,
  hasShipment,
  crossDock,
  t,
}: {
  step: Step;
  hasShipment: boolean;
  crossDock?: boolean;
  t: (k: string) => string;
}) {
  // У кроссдока шага «место» нет: товар на полку не встаёт (п.10.1).
  const steps = crossDock ? STEPS.filter((s) => s.id !== "place") : STEPS;
  const idx = steps.findIndex((s) => s.id === step);
  return (
    <ol className="flex items-center gap-1 text-[11px]">
      {steps.map((s, i) => {
        // Без сверки шаг «количество» остаётся, но подписан иначе.
        const active = i === idx;
        const passed = i < idx;
        return (
          <li key={s.id} className="flex items-center gap-1">
            <span
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : passed
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground",
              )}
            >
              <s.icon className="size-3" />
              {t(s.id === "qty" && !hasShipment ? "recv.step.qtyFree" : s.key)}
            </span>
            {i < steps.length - 1 && (
              <span className="text-muted-foreground/40">·</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function ShipmentBar({
  shipment,
  received,
  onClose,
  done,
  t,
}: {
  shipment: ExpectedShipment;
  received: number;
  onClose: () => void;
  done: boolean;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  const expected = shipment.lines.reduce((s, l) => s + l.expectedQty, 0);
  const got = shipment.lines.reduce((s, l) => s + l.receivedQty, 0);
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border px-3 py-2",
        done ? "border-emerald-500/40 bg-emerald-500/10" : "border-border bg-card",
      )}
    >
      <div className="min-w-0 text-xs">
        <p className="truncate font-medium">
          {shipment.title || t("recv.pick.untitled")}
        </p>
        <p className="text-muted-foreground">
          {t("recv.bar.progress", { got, expected })}
          {received > 0 && ` · ${t("recv.bar.session", { n: received })}`}
        </p>
      </div>
      <Button size="sm" variant={done ? "default" : "outline"} onClick={onClose}>
        {t(done ? "recv.bar.finish" : "recv.bar.finishEarly")}
      </Button>
    </div>
  );
}

function ShipmentLines({
  shipment,
  t,
}: {
  shipment: ExpectedShipment;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  const products = useEditor((s) => s.products);
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full border-collapse text-xs">
        <thead className="bg-muted/50">
          <tr className="text-left">
            <th className="px-2.5 py-1.5 font-medium">{t("table.col.name")}</th>
            <th className="px-2.5 py-1.5 text-right font-medium">
              {t("recv.lines.expected")}
            </th>
            <th className="px-2.5 py-1.5 text-right font-medium">
              {t("recv.lines.received")}
            </th>
          </tr>
        </thead>
        <tbody>
          {shipment.lines.map((l) => {
            const p = products.find((x) => x.id === l.productId);
            const full = l.receivedQty >= l.expectedQty;
            return (
              <tr key={l.id} className="border-t border-border/60">
                <td className="px-2.5 py-1.5">
                  {p?.name ?? "—"}{" "}
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {p?.sku}
                  </span>
                </td>
                <td className="px-2.5 py-1.5 text-right tabular-nums">
                  {l.expectedQty}
                </td>
                <td
                  className={cn(
                    "px-2.5 py-1.5 text-right font-medium tabular-nums",
                    full && "text-emerald-600 dark:text-emerald-400",
                  )}
                >
                  {l.receivedQty}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function QtyStep({
  draft,
  remainder,
  onQty,
  onConfirm,
  onBack,
  t,
}: {
  draft: Draft;
  remainder: number | null;
  onQty: (v: number) => void;
  onConfirm: () => void;
  onBack: () => void;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  const match = remainder != null && draft.qty === remainder;
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-semibold">{draft.product.name}</p>
        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
          {draft.product.sku} · {draft.product.barcode}
        </p>
        {remainder != null ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {t("recv.qty.expected", { n: remainder })}
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            {t("recv.qty.noPlan")}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("recv.qty.label")}
        </span>
        <div className="flex items-center gap-3">
          <QtyStepper value={draft.qty} onChange={onQty} autoFocus />
          {remainder != null && (
            <span
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium",
                match
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                  : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
              )}
            >
              {match ? <Check className="size-3.5" /> : null}
              {match
                ? t("recv.qty.matches")
                : t("recv.qty.diff", { n: Math.abs(draft.qty - remainder) })}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={onConfirm} disabled={draft.qty < 1}>
          {t("recv.qty.confirm")}
        </Button>
        <Button variant="ghost" onClick={onBack}>
          {t("recv.qty.cancel")}
        </Button>
      </div>
    </div>
  );
}

function StaffPicker({
  staff,
  value,
  onChange,
  t,
}: {
  staff: { id: string; name: string; role: string }[];
  value: string;
  onChange: (v: string) => void;
  t: (k: string) => string;
}) {
  if (!staff.length) return null;
  return (
    /* Поле по содержимому, а не во всю колонку: стрелка списка должна стоять
       у имени, а не уезжать к правому краю экрана. */
    <label className="flex flex-col items-start gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t("recv.staff")}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">{t("recv.staffNone")}</option>
        {staff.map((m) => (
          <option key={m.id} value={m.id}>
            {staffOptionLabel(m)}
          </option>
        ))}
      </select>
    </label>
  );
}
