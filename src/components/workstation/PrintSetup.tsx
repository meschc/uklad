import { useState } from "react";
import { Check, ChevronDown, Copy, Download, Printer } from "lucide-react";
import { deskUrl, downloadWindowsShortcut, macCommand, usePrintMode } from "@/lib/silentPrint";
import { useT, type MsgKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Печать без окна: строка «работает / открывается окно» и свёрнутая
 * инструкция. Это справка, а не главное: стоит под входом стола, который
 * печатает (настроить до смены), и внизу панели принтера.
 */
export function PrintSetup() {
  const t = useT();
  const mode = usePrintMode();
  const url = deskUrl(window.location.origin, import.meta.env.BASE_URL);

  return (
    <div className="flex flex-col gap-1 text-sm">
      {mode === "silent" ? (
        <p className="flex items-center gap-2 text-success">
          <Check className="size-4 shrink-0" />
          {t("ws.printer.silentOn")}
        </p>
      ) : (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Printer className="size-4 shrink-0" />
          {t(mode === "dialog" ? "ws.printer.silentOff" : "ws.printer.silentUnknown")}
        </p>
      )}
      {/* Инструкция — справка по запросу, свёрнута: главное на экране не она. */}
      <Fold label={mode === "silent" ? "ws.printer.otherDesk" : "ws.printer.howTo"}>
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
    </div>
  );
}

/** Сворачиваемый блок: призрачная кнопка со стрелкой, как «Устройства» стола. */
function Fold({ label, children }: { label: MsgKey; children: React.ReactNode }) {
  const t = useT();
  const [open, setOpen] = useState(false);
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
