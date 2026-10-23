import { useState } from "react";
import { useEditor } from "@/lib/store";
import { workstationRepository } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import { findByCode } from "@/lib/barcode";
import { TARGET_PREFIX, toteContents } from "@/lib/packing";
import { uid } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { card } from "@/components/ui/card";
import { eyebrow } from "@/components/ui/eyebrow";
import { ScanField, type ScanStatus } from "@/components/fulfillment/ScanField";

/**
 * Два скана перед началом: тара с товаром и короб отгрузки. Ниже — тара,
 * которая есть на складе: в демо клик по ней делает то же, что скан.
 */
export function ToteStart() {
  const t = useT();
  const boxes = useEditor((s) => s.boxes);
  const [source, setSource] = useState<string | null>(null);
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [hint, setHint] = useState<string | null>(null);
  const start = useCommand(workstationRepository.packStart);

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
      {!source ? (
        <ScanField
          label={`1 · ${t("ws.tote.step1")}`}
          placeholder="UK-BOX-…"
          status={status}
          hint={hint ?? t("ws.tote.step1Hint")}
          actionLabel={t("ws.act.open")}
          onSubmit={pickSource}
        />
      ) : (
        <>
          <div
            className={card({ pad: "sm", className: "flex items-center justify-between gap-3" })}
          >
            <div>
              <p className={eyebrow({ tone: "muted", size: "xs" })}>{t("ws.tote.step1")}</p>
              <p className="font-mono text-sm">{source}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSource(null)}>
              {t("ws.tote.change")}
            </Button>
          </div>
          <ScanField
            label={`2 · ${t("ws.tote.step2")}`}
            placeholder={`${TARGET_PREFIX}…`}
            status={status}
            hint={start.error ? t(start.error) : t("ws.tote.step2Hint")}
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

      {!source && (
        <div className="flex flex-col gap-2">
          <h2 className={eyebrow({ tone: "muted" })}>{t("ws.tote.demo")}</h2>
          <p className="text-xs text-muted-foreground">{t("ws.tote.demoHint")}</p>
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
