import { Check, Copy, Download, Printer } from "lucide-react";
import { LABEL_SIZES, saveLabelPrinter, sizeLabel, useLabelPrinter } from "@/lib/labelPrinter";
import {
  deskUrl,
  downloadWindowsShortcut,
  macCommand,
  printNow,
  usePrintMode,
} from "@/lib/silentPrint";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { PrintableLabel } from "./PrintableLabel";

/**
 * Принтер этикеток этого стола — правая панель, как смена и журнал. Здесь же
 * включают печать без окна: ярлык Chrome с тихой печатью (`silentPrint.ts`).
 * Работает ли она, панель видит по последней печати и говорит прямо.
 * Настройка живёт в браузере стола: на другом столе другой принтер.
 */
export function PrinterPanel() {
  const t = useT();
  const printer = useLabelPrinter();
  const mode = usePrintMode();
  const current = sizeLabel(printer);
  const url = deskUrl(window.location.origin, import.meta.env.BASE_URL);

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">{t("ws.printer.lead")}</p>

      <div className="flex flex-col gap-2 text-sm">
        <span className="text-muted-foreground">{t("ws.printer.when")}</span>
        <Segmented
          value={printer.autoPrint ? "auto" : "button"}
          ariaLabel={t("ws.printer.when")}
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

      <Button className="self-start" onClick={() => printNow()}>
        <Printer />
        {t("ws.printer.test")}
      </Button>

      <section className="flex flex-col gap-3 border-t pt-4 text-sm">
        <h3 className="font-medium">{t("ws.printer.silentTitle")}</h3>
        {mode === "silent" ? (
          <p className="flex items-center gap-2 text-success">
            <Check className="size-4 shrink-0" />
            {t("ws.printer.silentOn")}
          </p>
        ) : (
          <p className="text-muted-foreground">
            {t(mode === "dialog" ? "ws.printer.silentOff" : "ws.printer.silentUnknown")}
          </p>
        )}
        {mode === "silent" ? (
          // Уже работает: инструкция нужна только для другого стола.
          <details className="flex flex-col gap-3 text-muted-foreground">
            <summary className="cursor-pointer">{t("ws.printer.otherDesk")}</summary>
            <SetupSteps url={url} />
          </details>
        ) : (
          <SetupSteps url={url} />
        )}
      </section>

      <PrintableLabel
        code="UK-TEST-0001"
        lines={[t("ws.printer.testLine"), current]}
        printer={printer}
      />
    </div>
  );
}

/** Как включить печать без окна: файл для Windows, команды для Mac. */
function SetupSteps({ url }: { url: string }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex list-decimal flex-col gap-2 pl-5 text-muted-foreground">
        <li>
          {t("ws.printer.step1")}
          <Button
            variant="outline"
            size="sm"
            className="mt-2 flex"
            onClick={() => downloadWindowsShortcut(url)}
          >
            <Download />
            {t("ws.printer.download")}
          </Button>
        </li>
        <li>{t("ws.printer.step2")}</li>
        <li>{t("ws.printer.step3")}</li>
      </ol>
      <MacCommands choose={macCommand(url, false)} work={macCommand(url, true)} />
    </div>
  );
}

/** Mac на упаковке редкость: команды для Терминала, а не отдельный файл. */
function MacCommands({ choose, work }: { choose: string; work: string }) {
  const t = useT();
  return (
    <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer">{t("ws.printer.mac")}</summary>
      <p className="mt-2">{t("ws.printer.macHint")}</p>
      {[choose, work].map((command) => (
        <div key={command} className="mt-2">
          <code className="block break-all rounded-md bg-muted p-2 font-mono">{command}</code>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void navigator.clipboard?.writeText(command)}
          >
            <Copy />
            {t("ws.printer.copy")}
          </Button>
        </div>
      ))}
    </details>
  );
}
