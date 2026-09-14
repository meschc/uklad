import { useLayoutEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useEditor } from "@/lib/store";
import { fulfillmentRepository, type Result } from "@/lib/data";
import { addressKey, formatAddress, parseAddress } from "@/lib/address";
import { buildOccupancy, occupantsAt } from "@/lib/placement";
import { findByCode, findProduct, honestSignToEan13, parseHonestSignMock } from "@/lib/barcode";
import type { CellAddress, Discrepancy, ExpectedShipment, ReceivingProgress } from "@/lib/types";
import { useT, type MsgKey } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { ProductDialog } from "@/components/table/ProductDialog";
import { ScreenShell } from "./ScreenShell";
import { type ScanStatus } from "./ScanField";
import { ShipmentPicker } from "./ShipmentPicker";
import { DiscrepancyAlert } from "./DiscrepancyAlert";
import { BoxStep } from "./receiving/BoxStep";
import { PalletStep } from "./receiving/PalletStep";
import { PlaceStep } from "./receiving/PlaceStep";
import { ProductStep } from "./receiving/ProductStep";
import { QtyStep } from "./receiving/QtyStep";
import { ScanStatusLine } from "./receiving/ScanStatusLine";
import { ShipmentBar } from "./receiving/ShipmentBar";
import { StaffPicker } from "./receiving/StaffPicker";
import { Stepper } from "./receiving/Stepper";
import type { Draft } from "./receiving/types";

/**
 * Экран «Приёмка» — последовательный мастер, а не форма с десятком полей.
 *
 * Порядок шагов (п.5): поставка → скан товара → фактическое количество со
 * сверкой → коробка → место → паллета (опционально) → снова скан товара.
 * Приёмка — это СВЕРКА партии: сканируется одна единица, чтобы опознать
 * артикул, количество вводится руками.
 *
 * Здесь живёт только ход мастера: состояние, переходы и команды. Как выглядит
 * каждый шаг — в `receiving/`, по файлу на стадию: разрезано по физике работы
 * на рампе, а не по длине файла.
 *
 * Сам ход мастера (шаг, поставка, открытые тара и паллета) лежит в сторе и
 * переживает уход на другой экран и перезагрузку — приёмка идёт часами и
 * прерывается постоянно (п.4.7). В экране остаётся только сиюминутное:
 * опознанный сканом товар, подсветка поля, диалоги.
 */
export function ReceivingScreen() {
  const t = useT();
  const products = useEditor((s) => s.products);
  const warehouse = useEditor((s) => s.warehouse);
  const placements = useEditor((s) => s.placements);
  const boxes = useEditor((s) => s.boxes);
  const pallets = useEditor((s) => s.pallets);
  const shipments = useEditor((s) => s.expectedShipments);
  const staff = useEditor((s) => s.warehouse.staff ?? []);

  // Открытые тара и паллета держатся по id, а объекты берутся из стора: снимок
  // устаревал сразу после первой же записи товара, и плашка показывала «позиций
  // 0» у уже наполненной тары.
  const { step, shipmentId, staffId, boxId, palletId, received } = useEditor((s) => s.receiving);
  const setReceiving = useEditor((s) => s.setReceiving);
  const addReceived = useEditor((s) => s.addReceived);
  const resumeReceiving = useEditor((s) => s.resumeReceiving);

  /**
   * Возвращение в мастер. За время отлучки поставку мог сдать напарник, а тару
   * — увезти на место: сверяем сохранённый ход с данными ДО первой отрисовки,
   * иначе кладовщик успел бы увидеть шаг, под которым уже ничего нет.
   */
  useLayoutEffect(() => {
    resumeReceiving();
  }, [resumeReceiving]);

  const [draft, setDraft] = useState<Draft | null>(null);
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
  const [busy, setBusy] = useState(false);

  /**
   * Переход мастера: правка хода плюс гашение подсветки скана. Иначе красная
   * рамка и текст ошибки от прошлого шага висели на новом пустом поле —
   * интерфейс ругался на то, чего человек ещё не вводил.
   *
   * Отсюда правило по всему экрану: сначала переход, потом сообщение. React
   * склеивает обновления одного обработчика, и `ok()` перед `go()` победить не
   * может — успех молча превращался в пустоту, и кладовщик видел строку
   * состояния только когда ошибался.
   */
  const go = (patch: Partial<ReceivingProgress>) => {
    setReceiving(patch);
    setScan({ status: "idle" });
  };

  const shipment: ExpectedShipment | undefined = shipments.find((s) => s.id === shipmentId);
  /** Кроссдок-поставка: шага «место» у неё нет вовсе (п.10.1). */
  const crossDock = !!shipment?.crossDock;
  const occupancy = useMemo(() => buildOccupancy(placements, boxes), [placements, boxes]);

  const fail = (msgKey: MsgKey, vars?: Record<string, string | number>) =>
    setScan({ status: "error", msg: t(msgKey, vars) });
  const ok = (msgKey: MsgKey, vars?: Record<string, string | number>) =>
    setScan({ status: "ok", msg: t(msgKey, vars) });

  /**
   * Команда приёмки через слой данных (п.3.2.1). Отдельного `useCommand` здесь
   * нет намеренно: у экрана уже есть своя строка состояния — та, в которой он
   * пишет «не тот штрихкод» и «место занято». Отказ репозитория — сообщение той
   * же природы, и заводить ему второе место значило бы учить кладовщика
   * смотреть в две точки вместо одной.
   *
   * `busy` держит только кнопки «новая тара» и «новая паллета»: два нажатия
   * подряд по сети завели бы две пустые единицы. Поле скана при этом НЕ
   * блокируется — сканер печатает как клавиатура, и выключенное на полсекунды
   * поле молча съело бы половину штрихкода.
   */
  const run = async <T,>(op: () => Promise<Result<T>>): Promise<Result<T>> => {
    setBusy(true);
    const res = await op();
    setBusy(false);
    if (!res.ok) fail(res.error);
    return res;
  };

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
    const product = findProduct(products, raw);

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
      go({ step: "qty" });
      ok("recv.scan.offPlan", { name: product.name });
      return;
    }
    setDraft({
      product,
      lineId: line?.lineId,
      qty: line?.remainder && line.remainder > 0 ? line.remainder : 1,
    });
    go({ step: "qty" });
    ok("recv.scan.found", { name: product.name });
  };

  // --- 5.3 количество со сверкой ---------------------------------------------

  const confirmQty = () => {
    if (!draft) return;
    const line = remainderFor(draft.product.id);
    if (!line || line.remainder === 0) {
      // Сверять не с чем — свободная приёмка.
      void putInBox(draft);
      return;
    }
    if (draft.qty === line.remainder) {
      ok("recv.qty.match");
      void putInBox(draft);
      return;
    }
    setPendingDiscrepancy({
      kind: draft.qty < line.remainder ? "shortage" : "overage",
      expected: line.remainder,
    });
  };

  // --- паллета (необязательный первый шаг) -----------------------------------

  const onScanPallet = (raw: string) => {
    const found = findByCode(pallets, raw);
    if (!found) {
      fail("recv.pallet.unknown");
      return;
    }
    go({ palletId: found.id, step: "box" });
    ok("recv.pallet.opened", { code: found.barcode });
  };

  const onNewPallet = async () => {
    const res = await run(() => fulfillmentRepository.createPallet());
    if (!res.ok) return;
    go({ palletId: res.data.id, step: "box" });
    ok("recv.pallet.created", { code: res.data.barcode });
  };

  // --- тара -------------------------------------------------------------------

  const onScanBox = (raw: string) => {
    const found = findByCode(boxes, raw);
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
    go({ boxId: found.id, step: "product" });
    ok("recv.box.opened", { code: found.barcode });
  };

  const onNewBox = async () => {
    const res = await run(() => fulfillmentRepository.createBox());
    if (!res.ok) return;
    go({ boxId: res.data.id, step: "product" });
    ok("recv.box.created", { code: res.data.barcode });
  };

  /** Товар уезжает в открытую тару; тара пока стоит на рампе, без адреса. */
  const putInBox = async (d: Draft) => {
    if (!box) return;
    const res = await run(() =>
      fulfillmentRepository.receive({
        productId: d.product.id,
        qty: d.qty,
        boxId: box.id,
        shipmentId: shipment?.id,
        lineId: d.lineId,
        staffId: staffId || undefined,
        discrepancy: d.discrepancy,
      }),
    );
    if (!res.ok) return;
    addReceived(d.qty);

    // Кроссдокинг (п.10.1): товар не поедет на полку — он тут же закрывает
    // заявки, которые его ждали. Что не разошлось по заявкам, останется в таре
    // и поедет на место обычным путём.
    if (crossDock) {
      const sent = await run(() =>
        fulfillmentRepository.crossDock(d.product.id, d.qty, shipment?.id),
      );
      // Провал разбора по заявкам не отменяет приёмку: товар уже принят и лежит
      // в таре. Дать «повторить» здесь было бы хуже отказа — приёмка записалась
      // бы вторым фактом. Не разошедшееся просто поедет обычным путём, ровно
      // как при отсутствии подходящих заявок.
      nextProduct();
      if (sent.ok) {
        ok(sent.data > 0 ? "recv.crossDock.sent" : "recv.crossDock.noRequests", {
          name: d.product.name,
          n: sent.data,
        });
      }
      return;
    }

    nextProduct();
    ok("recv.box.added", { name: d.product.name, n: d.qty, code: box.barcode });
  };

  /**
   * Кроссдок-тара уезжает в зону отгрузки без адреса: она физически не
   * хранится, и в занятость (`buildOccupancy`) попадать не должна.
   */
  const closeCrossDockBox = async () => {
    if (!box) return;
    if (pallet) {
      const res = await run(() => fulfillmentRepository.attachBox(box.id, pallet.id));
      if (!res.ok) return;
    }
    setDraft(null);
    go({ boxId: null, step: "box" });
    ok("recv.crossDock.closed", { code: box.barcode });
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
    const sameBox = !!box?.address && addressKey(box.address) === addressKey(addr);
    if (others.length && !sameBox) {
      const who = products.find((p) => p.id === others[0]);
      fail("recv.place.busy", { name: who?.name ?? t("recv.place.someone") });
      return;
    }
    void commit(addr);
  };

  /**
   * Закрытая тара едет на место; если есть паллета — привязываем к ней.
   *
   * Привязка отдельной командой: если она не пройдёт, тара уже стоит на месте,
   * и повторный скан того же адреса безопасен — «та же коробка на том же
   * месте» экран считает продолжением укладки, а не конфликтом.
   */
  const commit = async (addr: CellAddress) => {
    if (!box) return;
    const placed = await run(() => fulfillmentRepository.placeBox(box.id, addr));
    if (!placed.ok) return;
    if (pallet) {
      const linked = await run(() => fulfillmentRepository.attachBox(box.id, pallet.id));
      if (!linked.ok) return;
    }
    setDraft(null);
    go({ boxId: null, step: "box" });
    ok("recv.place.done", { addr: formatAddress(warehouse, addr) ?? "" });
  };

  /**
   * Закрыть поставку. При отказе экран остаётся на ней: увести кладовщика на
   * выбор поставки, не закрыв её на сервере, значило бы соврать — он ушёл бы
   * уверенный, что приёмка сдана.
   */
  const onCloseShipment = async () => {
    if (!shipment) return;
    const res = await run(() => fulfillmentRepository.closeShipment(shipment.id));
    if (!res.ok) return;
    go({ shipmentId: null, step: "shipment" });
  };

  /** 5.7 — следующий товар той же поставки, без лишнего клика. */
  const nextProduct = () => {
    setDraft(null);
    setPendingDiscrepancy(null);
    go({ step: "product" });
  };

  /** Паллета уехала — следующая партия начинается с чистого листа. */
  const closePallet = () => {
    setDraft(null);
    go({ palletId: null, boxId: null, step: "pallet" });
    ok("recv.pallet.closed");
  };

  /** Вернуться к выбору поставки из любого места мастера. */
  const backToShipment = () => {
    setDraft(null);
    go({ step: "shipment" });
  };

  // --- рендер ----------------------------------------------------------------

  const shipmentDone = shipment && shipment.lines.every((l) => l.receivedQty >= l.expectedQty);

  return (
    <ScreenShell
      title={t("recv.title")}
      subtitle={t("recv.subtitle")}
      actions={
        step !== "shipment" && (
          <Button size="sm" variant="ghost" onClick={backToShipment}>
            <ArrowLeft className="size-3.5" />
            {t("recv.changeShipment")}
          </Button>
        )
      }
    >
      {step !== "shipment" && (
        <Stepper step={step} hasShipment={!!shipment} crossDock={crossDock} t={t} />
      )}

      {shipment && step !== "shipment" && (
        <ShipmentBar
          shipment={shipment}
          received={received}
          onClose={() => void onCloseShipment()}
          done={!!shipmentDone}
          t={t}
        />
      )}

      <ScanStatusLine status={scan.status} msg={scan.msg} />

      {step === "shipment" && (
        <div className="flex flex-col gap-4">
          <StaffPicker
            staff={staff}
            value={staffId}
            onChange={(id) => setReceiving({ staffId: id })}
            t={t}
          />
          <ShipmentPicker
            onPick={(id) => go({ shipmentId: id, received: 0, step: "pallet" })}
            onFreeform={() => go({ shipmentId: null, received: 0, step: "pallet" })}
          />
        </div>
      )}

      {step === "pallet" && (
        <PalletStep
          status={scan.status}
          busy={busy}
          onScan={onScanPallet}
          onNew={() => void onNewPallet()}
          onSkip={() => go({ step: "box" })}
          t={t}
        />
      )}

      {step === "box" && (
        <BoxStep
          pallet={pallet}
          status={scan.status}
          busy={busy}
          onScan={onScanBox}
          onNew={() => void onNewBox()}
          onClosePallet={closePallet}
          t={t}
        />
      )}

      {step === "product" && box && (
        <ProductStep
          box={box}
          shipment={shipment}
          crossDock={crossDock}
          status={scan.status}
          blocked={!!newProductCode}
          onScan={onScanProduct}
          onCloseBox={() => (crossDock ? void closeCrossDockBox() : go({ step: "place" }))}
          t={t}
        />
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
        <PlaceStep box={box} status={scan.status} onScan={onScanPlace} t={t} />
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
            void putInBox({ ...draft, discrepancy: pendingDiscrepancy.kind });
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
