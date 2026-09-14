import type { Box } from "@/lib/types";
import { type TFunc } from "@/lib/i18n";
import { QrSvg } from "@/components/table/QrSvg";
import { card } from "@/components/ui/card";
import { ScanField, type ScanStatus } from "../ScanField";

/** Минимальная длина ярлыка ячейки: «А1» — это ещё не адрес, а опечатка. */
const ADDRESS_MIN = 3;

/** Сторона ярлыка на экране: столько же, сколько на печатной наклейке тары. */
const LABEL_QR_PX = 128;

/**
 * Шаг «место»: закрытая тара едет на полку.
 *
 * Ярлык печатается ДО скана адреса, а не после: коробку нужно подписать в тот
 * момент, когда она ещё в руках. Подписанная задним числом тара — это тара,
 * которую сначала унесли, а потом искали.
 */
export function PlaceStep({
  box,
  status,
  onScan,
  t,
}: {
  box: Box;
  status: ScanStatus;
  onScan: (raw: string) => void;
  t: TFunc;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className={card({ className: "flex flex-col items-center gap-2" })}>
        <p className="text-xs font-medium text-muted-foreground">{t("recv.box.label128")}</p>
        <QrSvg code={box.barcode} size={LABEL_QR_PX} className="rounded-md p-3" />
      </div>
      <ScanField
        label={t("recv.place.label")}
        hint={t("recv.place.hint")}
        status={status}
        minLength={ADDRESS_MIN}
        onSubmit={onScan}
      />
    </div>
  );
}
