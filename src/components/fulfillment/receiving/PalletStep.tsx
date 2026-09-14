import { Layers, SkipForward } from "lucide-react";
import { type TFunc } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { ScanField, type ScanStatus } from "../ScanField";

/**
 * Шаг «паллета» — необязательный: мелкую поставку принимают сразу в тару.
 *
 * Кнопка «новая паллета» гасится на время записи (`busy`), поле скана — нет:
 * сканер печатает как клавиатура, и выключенное на полсекунды поле молча съело
 * бы половину штрихкода.
 */
export function PalletStep({
  status,
  busy,
  onScan,
  onNew,
  onSkip,
  t,
}: {
  status: ScanStatus;
  busy: boolean;
  onScan: (raw: string) => void;
  onNew: () => void;
  onSkip: () => void;
  t: TFunc;
}) {
  return (
    <div className="flex flex-col gap-4">
      <ScanField
        label={t("recv.pallet.label")}
        hint={t("recv.pallet.hint")}
        status={status}
        onSubmit={onScan}
      />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={onNew} disabled={busy}>
          <Layers className="size-3.5" />
          {t("recv.pallet.new")}
        </Button>
        <Button onClick={onSkip}>
          <SkipForward className="size-3.5" />
          {t("recv.pallet.skip")}
        </Button>
      </div>
    </div>
  );
}
