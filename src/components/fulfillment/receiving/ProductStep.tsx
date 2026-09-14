import { Box as BoxIcon } from "lucide-react";
import type { Box, ExpectedShipment } from "@/lib/types";
import { type TFunc } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { ScanField, type ScanStatus } from "../ScanField";
import { ActiveTag } from "./ActiveTag";
import { ShipmentLines } from "./ShipmentLines";

/**
 * Шаг «товар»: сканируется одна единица, чтобы опознать артикул. Приёмка —
 * сверка партии, а не поштучный пересчёт: количество вводится дальше руками.
 *
 * Тара закрывается явно, отдельным нажатием: только после этого у неё
 * появляется адрес. У кроссдок-поставки адреса не будет вовсе — тара едет в
 * отгрузку (п.10.1), поэтому и подпись у кнопки другая.
 */
export function ProductStep({
  box,
  shipment,
  crossDock,
  status,
  blocked,
  onScan,
  onCloseBox,
  t,
}: {
  box: Box;
  shipment?: ExpectedShipment;
  crossDock: boolean;
  status: ScanStatus;
  /** Открыта карточка неучтённого товара — скан не должен срабатывать за её спиной. */
  blocked: boolean;
  onScan: (raw: string) => void;
  onCloseBox: () => void;
  t: TFunc;
}) {
  return (
    <div className="flex flex-col gap-4">
      <ActiveTag label={t("recv.box.active", { code: box.barcode, n: box.lines.length })} />
      <ScanField
        label={t("recv.scan.label")}
        hint={t("recv.scan.hint")}
        status={status}
        disabled={blocked}
        onSubmit={onScan}
      />
      <Button
        variant="outline"
        className="self-start"
        disabled={box.lines.length === 0}
        onClick={onCloseBox}
      >
        <BoxIcon className="size-3.5" />
        {crossDock ? t("recv.crossDock.close") : t("recv.box.close")}
      </Button>
      {shipment && <ShipmentLines shipment={shipment} t={t} />}
    </div>
  );
}
