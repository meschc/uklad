import { Check, X, Wand2 } from "lucide-react";
import { useEditor } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

/**
 * Плавающая панель «Продолжить ряды по образцу» (ТЗ, разд. 3.5).
 *
 * Появляется, когда после закрепления ряда система нашла такие же по форме
 * нераспределённые группы секций. Кандидаты отмечаются галочками прямо на
 * холсте (призрачные рамки), а здесь — сводка и применение одним действием.
 */
export function RowProposalPanel() {
  const proposal = useEditor((s) => s.rowProposal);
  const apply = useEditor((s) => s.applyRowProposal);
  const dismiss = useEditor((s) => s.dismissRowProposal);
  const t = useT();

  if (!proposal) return null;
  const total = proposal.candidates.length;
  const picked = proposal.candidates.filter((c) => c.checked).length;

  return (
    <div className="pointer-events-auto absolute left-1/2 top-3 z-20 flex -translate-x-1/2 animate-fade-in items-center gap-3 rounded-xl border border-border bg-card/95 px-3 py-2 shadow-lg backdrop-blur">
      <div className="flex items-center gap-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Wand2 className="size-4" />
        </div>
        <div className="leading-tight">
          <p className="text-xs font-semibold">{t("proposal.title")}</p>
          <p className="text-[11px] text-muted-foreground">
            {t("proposal.subtitle", { picked, total })}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <Button size="sm" onClick={apply} disabled={picked === 0}>
          <Check className="size-3.5" />
          {t("proposal.apply")}
        </Button>
        <Button size="sm" variant="ghost" onClick={dismiss}>
          <X className="size-3.5" />
          {t("proposal.cancel")}
        </Button>
      </div>
    </div>
  );
}
