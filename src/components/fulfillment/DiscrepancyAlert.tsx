import { AlertTriangle, RotateCcw, Save } from "lucide-react";
import { useT } from "@/lib/i18n";
import { DialogShell } from "@/components/ui/dialog-shell";
import { Button } from "@/components/ui/button";
import { eyebrow } from "@/components/ui/eyebrow";
import type { Discrepancy } from "@/lib/types";

/**
 * Расхождение план/факт при приёмке (п. 5.3).
 *
 * Тот же язык алертов, что у «на полке товар» (`GoodsConflictDialog`):
 * штриховка hazard-stripes, янтарная шапка, два РАВНОЦЕННЫХ действия. Приёмку
 * не блокируем, но и молча не пропускаем — расхождение либо пересчитывают,
 * либо записывают явно как недостачу/перестачу.
 */
export function DiscrepancyAlert({
  productName,
  expected,
  actual,
  kind,
  onRecheck,
  onRecord,
}: {
  productName: string;
  /** Остаток по строке поставки: сколько ещё ждали. */
  expected: number;
  actual: number;
  kind: Discrepancy;
  onRecheck: () => void;
  onRecord: () => void;
}) {
  const t = useT();
  const delta = Math.abs(actual - expected);

  return (
    <DialogShell>
      <div className="hazard-stripes flex gap-3 bg-amber-500/10 px-5 py-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <AlertTriangle className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {t(kind === "shortage" ? "recv.disc.shortage" : "recv.disc.overage")}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("recv.disc.subtitle", { name: productName })}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-px border-y border-border bg-border">
        <Cell label={t("recv.disc.expected")} value={expected} />
        <Cell label={t("recv.disc.actual")} value={actual} />
        <Cell
          label={t(kind === "shortage" ? "recv.disc.missing" : "recv.disc.extra")}
          value={delta}
          tone
        />
      </div>

      <div className="flex flex-col gap-2 px-5 py-4">
        <Button size="sm" onClick={onRecheck}>
          <RotateCcw className="size-3.5" />
          {t("recv.disc.recheck")}
        </Button>
        <Button size="sm" variant="outline" onClick={onRecord}>
          <Save className="size-3.5" />
          {t("recv.disc.record")}
        </Button>
        <p className="text-center text-[11px] text-muted-foreground">{t("recv.disc.note")}</p>
      </div>
    </DialogShell>
  );
}

function Cell({ label, value, tone }: { label: string; value: number; tone?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-0.5 bg-card px-2 py-3">
      <span className={eyebrow({ size: "xs", weight: "normal" })}>{label}</span>
      <span
        className={
          tone
            ? "text-xl font-bold tabular-nums text-amber-600 dark:text-amber-400"
            : "text-xl font-bold tabular-nums"
        }
      >
        {value}
      </span>
    </div>
  );
}
