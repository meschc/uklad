import { useState } from "react";
import { Check, ChevronDown, Copy, Download, Printer } from "lucide-react";
import { sizeLabel, useLabelPrinter } from "@/lib/labelPrinter";
import {
  deskUrl,
  downloadWindowsShortcut,
  macCommand,
  printNow,
  usePrintMode,
} from "@/lib/silentPrint";
import { useT, type MsgKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PrintableLabel } from "./PrintableLabel";

/**
 * Печать без окна: работает ли она на этом компьютере и как её включить.
 * Стоит в двух местах: на экране входа стола, который печатает, — чтобы
 * настроить до начала работы, — и в панели принтера.
 */
export function PrintSetup({ compact }: { compact?: boolean }) {
  const t = useT();
  const mode = usePrintMode();
  const printer = useLabelPrinter();
  const url = deskUrl(window.location.origin, import.meta.env.BASE_URL);

  return (
    <section className="flex flex-col gap-3 text-sm">
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
      <Button
        className="self-start"
        variant={compact ? "outline" : "default"}
        onClick={() => printNow()}
      >
        <Printer />
        {t("ws.printer.test")}
      </Button>
      {/* Уже работает — инструкция нужна только для другого стола. */}
      <Fold
        label={mode === "silent" ? "ws.printer.otherDesk" : "ws.printer.howTo"}
        open={mode !== "silent"}
      >
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
        {/* Mac на упаковке редкость: команды для Терминала, а не отдельный файл. */}
        <Fold label="ws.printer.mac">
          <p className="text-xs text-muted-foreground">{t("ws.printer.macHint")}</p>
          {[macCommand(url, false), macCommand(url, true)].map((command) => (
            <div key={command} className="flex flex-col items-start gap-1">
              <code className="block w-full break-all rounded-md bg-muted p-2 font-mono text-xs">
                {command}
              </code>
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
        </Fold>
      </Fold>
      <PrintableLabel
        code="UK-TEST-0001"
        lines={[t("ws.printer.testLine"), sizeLabel(printer)]}
        printer={printer}
      />
    </section>
  );
}

/** Сворачиваемый блок: призрачная кнопка со стрелкой, как «Устройства» стола. */
function Fold({
  label,
  open: initial = false,
  children,
}: {
  label: MsgKey;
  open?: boolean;
  children: React.ReactNode;
}) {
  const t = useT();
  const [open, setOpen] = useState(initial);
  return (
    <div className="flex flex-col gap-3">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 self-start"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {t(label)}
        <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
      </Button>
      {open && children}
    </div>
  );
}
