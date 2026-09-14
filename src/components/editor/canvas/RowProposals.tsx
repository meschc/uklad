import { Check } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useEditor } from "@/lib/store";
import type { RowProposalItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { ToScreen } from "./screen";

/**
 * Продолжение по образцу: призрачные рамки-кандидаты с галочкой и предлагаемым
 * номером ряда. Отмеченные применяются одним действием из плавающей панели
 * «Продолжить ряды?» — здесь только их вид на плане и переключение галочки.
 */

interface RowProposalsProps {
  candidates: RowProposalItem[];
  toScreen: ToScreen;
}

export function RowProposals({ candidates, toScreen }: RowProposalsProps) {
  const t = useT();
  return (
    <>
      {candidates.map((c, i) => {
        const s = toScreen(c.rect);
        return (
          <div
            key={`prop-${i}`}
            className="absolute"
            style={{ left: s.left, top: s.top, width: s.width, height: s.height }}
          >
            <div
              className={cn(
                "absolute inset-0 rounded-md border border-dashed transition-colors",
                c.checked
                  ? "border-primary/70 bg-primary/10"
                  : "border-muted-foreground/30 bg-transparent",
              )}
            />
            <button
              type="button"
              onClick={() => useEditor.getState().toggleRowProposal(i)}
              className={cn(
                "pointer-events-auto absolute left-1/2 top-0 flex -translate-x-1/2 -translate-y-full items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums shadow-sm transition-colors",
                c.checked
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground ring-1 ring-inset ring-border",
              )}
            >
              <span
                className={cn(
                  "flex size-3 items-center justify-center rounded-[3px] border",
                  c.checked
                    ? "border-primary-foreground/70 bg-primary-foreground/20"
                    : "border-muted-foreground/50",
                )}
              >
                {c.checked && <Check className="size-2.5" />}
              </span>
              {t("canvas.rowFrame", { n: c.number })}
            </button>
          </div>
        );
      })}
    </>
  );
}
