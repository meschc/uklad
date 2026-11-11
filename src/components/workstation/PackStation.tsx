import { useState } from "react";
import { Package } from "lucide-react";
import { useEditor } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { eyebrow } from "@/components/ui/eyebrow";
import { ToteStart } from "./ToteStart";
import { PackRun, type PackResult } from "./PackRun";

/**
 * Стол упаковки от тары: тара с товаром → короб отгрузки → поштучный цикл
 * «скан товара → этикетка → скан этикетки». Правила — в `lib/packing.ts`.
 */
export function PackStation({ staffId }: { staffId: string }) {
  const session = useEditor((s) => s.packSession);
  const [result, setResult] = useState<PackResult | null>(null);

  if (result) return <PackDone result={result} onNext={() => setResult(null)} />;
  if (session && session.staffId === staffId)
    return <PackRun session={session} onDone={setResult} />;

  return <ToteStart />;
}

function PackDone({ result, onNext }: { result: PackResult; onNext: () => void }) {
  const t = useT();
  const rows: [string, string][] = [
    [t("ws.run.packed"), t("ws.tote.units", { n: result.packed })],
    [t("ws.run.defects"), t("ws.tote.units", { n: result.defects })],
    [t("ws.run.errors"), String(result.errors)],
    [t("ws.done.shortage"), t("ws.tote.units", { n: result.shortage })],
    [
      t("ws.run.avg"),
      result.avgMs == null ? "—" : t("ws.run.sec", { n: Math.round(result.avgMs / 1000) }),
    ],
  ];
  return (
    <section className="flex flex-col items-center gap-4">
      <span className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Package className="size-6" />
      </span>
      <h2 className="text-lg font-semibold">{t("ws.done.title")}</h2>
      <p className="font-mono text-sm text-muted-foreground">
        {result.source} → {result.target}
      </p>
      <dl className="grid w-full max-w-sm grid-cols-[minmax(0,1fr)_6rem] gap-y-1.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className={eyebrow({ tone: "muted" })}>{k}</dt>
            <dd className="whitespace-nowrap text-right font-medium tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <Button size="lg" onClick={onNext}>
        {t("ws.done.next")}
      </Button>
    </section>
  );
}
