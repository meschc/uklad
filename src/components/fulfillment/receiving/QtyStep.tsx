import { Check } from "lucide-react";
import { type TFunc } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { eyebrow } from "@/components/ui/eyebrow";
import { card } from "@/components/ui/card";
import { QtyStepper } from "../QtyStepper";
import type { Draft } from "./types";

/**
 * Шаг «количество»: главный шаг приёмки как сверки.
 *
 * Расхождение показывается сразу, прямо у поля, а не после подтверждения:
 * человек должен увидеть «не сходится на 3» пока коробка ещё перед ним, а не
 * когда он уже потянулся за следующей.
 */
export function QtyStep({
  draft,
  remainder,
  onQty,
  onConfirm,
  onBack,
  t,
}: {
  draft: Draft;
  /** Остаток по строке поставки; null — сверять не с чем, свободная приёмка. */
  remainder: number | null;
  onQty: (v: number) => void;
  onConfirm: () => void;
  onBack: () => void;
  t: TFunc;
}) {
  const match = remainder != null && draft.qty === remainder;
  return (
    <div className="flex flex-col gap-4">
      <div className={card()}>
        <p className="text-sm font-semibold">{draft.product.name}</p>
        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
          {draft.product.sku} · {draft.product.barcode}
        </p>
        {remainder != null ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {t("recv.qty.expected", { n: remainder })}
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">{t("recv.qty.noPlan")}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className={eyebrow()}>{t("recv.qty.label")}</span>
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line jsx-a11y/no-autofocus -- карточка открылась по скану товара: следующее действие кладовщика — ввести количество */}
          <QtyStepper value={draft.qty} onChange={onQty} autoFocus />
          {remainder != null && (
            <span
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium",
                match
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                  : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
              )}
            >
              {match ? <Check className="size-3.5" /> : null}
              {match
                ? t("recv.qty.matches")
                : t("recv.qty.diff", { n: Math.abs(draft.qty - remainder) })}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={onConfirm} disabled={draft.qty < 1}>
          {t("recv.qty.confirm")}
        </Button>
        <Button variant="ghost" onClick={onBack}>
          {t("recv.qty.cancel")}
        </Button>
      </div>
    </div>
  );
}
