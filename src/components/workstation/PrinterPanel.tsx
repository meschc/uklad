import { Printer } from "lucide-react";
import { LABEL_SIZES, saveLabelPrinter, sizeLabel, useLabelPrinter } from "@/lib/labelPrinter";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PrintableLabel } from "./PrintableLabel";

/**
 * Принтер этикеток этого стола — правая панель, как смена и журнал. Браузер не
 * даёт выбрать принтер сам: имя здесь напоминает, что выбрать в окне печати,
 * а размер ленты задаёт бумагу этого окна. Настройка живёт в браузере стола.
 */
export function PrinterPanel() {
  const t = useT();
  const printer = useLabelPrinter();
  const current = sizeLabel(printer);

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">{t("ws.printer.lead")}</p>

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

      <Button className="self-start" onClick={() => window.print()}>
        <Printer />
        {t("ws.printer.test")}
      </Button>

      <div className="flex flex-col gap-1 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">{t("ws.printer.silentTitle")}</p>
        <p>{t("ws.printer.silent")}</p>
      </div>

      <PrintableLabel
        code="UK-TEST-0001"
        lines={[t("ws.printer.testLine"), current]}
        printer={printer}
      />
    </div>
  );
}
