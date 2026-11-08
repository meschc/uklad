import { ArrowRight, Check, PackageOpen, PackagePlus } from "lucide-react";
import { useState } from "react";
import { useEditor } from "@/lib/store";
import { workstationRepository } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import { findByCode } from "@/lib/barcode";
import { TARGET_PREFIX, toteContents } from "@/lib/packing";
import { cn, uid } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { card } from "@/components/ui/card";
import { eyebrow } from "@/components/ui/eyebrow";
import { ScanField, type ScanStatus } from "@/components/fulfillment/ScanField";
import { useDemoHints } from "./useDemoHints";

/**
 * Два скана перед началом: тара с товаром и короб отгрузки. Ниже, только в
 * демо, — тара, которая есть на складе: клик по ней делает то же, что скан.
 */
export function ToteStart() {
  const t = useT();
  const boxes = useEditor((s) => s.boxes);
  const [source, setSource] = useState<string | null>(null);
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [hint, setHint] = useState<string | null>(null);
  const start = useCommand(workstationRepository.packStart);
  // Демо-тара собирается из собранных заявок «из воздуха»: на сервере это
  // товар, которого не было в таре, и сервер такую запись не примет.
  const demoHints = useDemoHints();

  const totes = boxes
    .filter((b) => toteContents(b).size > 0)
    .slice(-6)
    .reverse();

  const pickSource = (code: string) => {
    const box = findByCode(useEditor.getState().boxes, code);
    if (!box || toteContents(box).size === 0) {
      setStatus("error");
      setHint(t(box ? "ws.tote.empty" : "ws.tote.unknown"));
      return;
    }
    setSource(box.barcode);
    setStatus("ok");
    setHint(null);
  };

  const pickTarget = async (code: string) => {
    const res = await start.run(source!, code);
    setStatus(res.ok ? "ok" : "error");
  };

  const makeDemo = () => {
    const code = useEditor.getState().prepareDemoTote();
    if (code) pickSource(code);
    else setHint(t("ws.tote.demoNone"));
  };

  return (
    <section className="flex flex-col gap-5">
      {/* Шаги — иконками, а не цифрами в подписи: откуда берём → куда кладём. */}
      <ol className="flex items-center gap-3 text-sm">
        <Step icon={PackageOpen} label={t("ws.tote.step1")} state={source ? "done" : "now"} />
        <ArrowRight className="size-4 text-muted-foreground" />
        <Step icon={PackagePlus} label={t("ws.tote.step2")} state={source ? "now" : "next"} />
      </ol>
      {!source ? (
        <ScanField
          label={t("ws.tote.step1")}
          placeholder="UK-BOX-…"
          status={status}
          hint={hint ?? undefined}
          actionLabel={t("ws.act.open")}
          onSubmit={pickSource}
        />
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 font-mono text-sm">
              <PackageOpen className="size-4 text-muted-foreground" />
              {source}
            </p>
            <Button variant="ghost" size="sm" onClick={() => setSource(null)}>
              {t("ws.tote.change")}
            </Button>
          </div>
          <ScanField
            label={t("ws.tote.step2")}
            placeholder={`${TARGET_PREFIX}…`}
            status={status}
            hint={start.error ? t(start.error) : undefined}
            actionLabel={t("ws.act.target")}
            onSubmit={(c) => void pickTarget(c)}
          />
          <Button
            variant="outline"
            onClick={() => void pickTarget(`${TARGET_PREFIX}${uid("o").slice(-6).toUpperCase()}`)}
          >
            {t("ws.tote.newTarget")}
          </Button>
        </>
      )}

      {!source && demoHints && (
        <div className="flex flex-col gap-2">
          <h2 className={eyebrow({ tone: "muted" })}>{t("ws.tote.demo")}</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {totes.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  className={card({
                    pad: "sm",
                    className:
                      "flex w-full cursor-pointer items-center justify-between gap-3 text-left transition-colors hover:border-primary",
                  })}
                  onClick={() => pickSource(b.barcode)}
                >
                  <span className="font-mono text-sm">{b.barcode}</span>
                  <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                    {t("ws.tote.units", { n: b.lines.reduce((n, l) => n + l.qty, 0) })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Button variant="outline" onClick={makeDemo}>
            {t("ws.tote.demoMake")}
          </Button>
        </div>
      )}
    </section>
  );
}

function Step({
  icon: Icon,
  label,
  state,
}: {
  icon: typeof PackageOpen;
  label: string;
  state: "done" | "now" | "next";
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-2",
        state === "now" ? "font-semibold text-foreground" : "text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "flex size-8 items-center justify-center rounded-full",
          state === "now" ? "bg-primary text-primary-foreground" : "bg-muted",
        )}
      >
        {state === "done" ? <Check className="size-4" /> : <Icon className="size-4" />}
      </span>
      {label}
    </li>
  );
}
