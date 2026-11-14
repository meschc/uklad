import { LABEL_SIZES, saveLabelPrinter, sizeLabel, useLabelPrinter } from "@/lib/labelPrinter";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { PrintSetup } from "./PrintSetup";

/**
 * Принтер этикеток этого стола — правая панель, как смена и журнал. Здесь же
 * включают печать без окна: ярлык Chrome с тихой печатью (`silentPrint.ts`).
 * Работает ли она, панель видит по последней печати и говорит прямо.
 * Настройка живёт в браузере стола: на другом столе другой принтер.
 */
export function PrinterPanel() {
  const t = useT();
  const printer = useLabelPrinter();
  const current = sizeLabel(printer);

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">{t("ws.printer.lead")}</p>

      <div className="flex flex-col gap-2 text-sm">
        <span className="text-muted-foreground">{t("ws.printer.when")}</span>
        <Segmented
          value={printer.autoPrint ? "auto" : "button"}
          ariaLabel={t("ws.printer.when")}
          className="self-start"
          options={[
            { value: "auto", label: t("ws.printer.whenAuto") },
            { value: "button", label: t("ws.printer.whenButton") },
          ]}
          onChange={(v) => saveLabelPrinter({ autoPrint: v === "auto" })}
        />
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">{t("ws.printer.name")}</span>
        <Input
          value={printer.name}
          maxLength={60}
          placeholder={t("ws.printer.namePlaceholder")}
          onChange={(e) => saveLabelPrinter({ name: e.target.value })}
        />
      </label>

      <div className="flex flex-col gap-2 text-sm">
        <span className="text-muted-foreground">{t("ws.printer.size")}</span>
        <div className="flex flex-wrap gap-2">
          {LABEL_SIZES.map((s) => (
            <Button
              key={sizeLabel(s)}
              size="sm"
              variant={sizeLabel(s) === current ? "default" : "outline"}
              onClick={() => saveLabelPrinter(s)}
            >
              {sizeLabel(s)}
            </Button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">{t("ws.printer.sizeHint")}</span>
      </div>

      <div className="border-t pt-4">
        <PrintSetup />
      </div>
    </div>
  );
}
