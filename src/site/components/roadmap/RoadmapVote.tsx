import { ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RoadmapItem } from "../../data/roadmap";
import { toggleVote } from "../../lib/roadmap/store";
import { c, useT } from "../../lib/copy";

const T = {
  voteFor: c("Голос за «{title}», сейчас {count}", "Vote for “{title}”, now {count}"),
  votedFor: c(
    "Вы голосовали за «{title}», всего {count}. Нажмите, чтобы снять",
    "You voted for “{title}”, {count} in total. Click to remove",
  ),
};

/**
 * Голос как у taptop: стрелка и число. Нажатие засчитывается сразу (без
 * входа сначала откроется окно входа, и голос встанет сам после него);
 * повторное нажатие снимает голос.
 *
 * Название пункта уходит в `aria-label` целиком: на доске таких кнопок
 * полсотни, и подряд идущие «12, 4, 7» ни о чём не говорят.
 */
export function RoadmapVote({
  item,
  voted,
  count,
  size = "sm",
}: {
  item: RoadmapItem;
  voted: boolean;
  count: number;
  size?: "sm" | "lg";
}) {
  const t = useT();
  const title = t(item.title);

  return (
    <button
      type="button"
      onClick={() => toggleVote(item.id)}
      aria-pressed={voted}
      aria-label={t(voted ? T.votedFor : T.voteFor, { title, count })}
      className={cn(
        "r-chip relative z-10 inline-flex shrink-0 items-center gap-1 font-medium tabular-nums transition-colors",
        size === "lg" ? "h-10 px-3.5 text-sm" : "h-8 px-2.5 text-xs",
        voted
          ? "bg-[var(--wh-blue)] text-[var(--wh-on-blue)]"
          : "bg-[var(--wh-soft)] text-foreground shadow-[inset_0_0_0_1px_var(--wh-line)] hover:text-[var(--wh-blue)]",
      )}
    >
      <ChevronUp className={size === "lg" ? "size-4" : "size-3.5"} strokeWidth={2.5} />
      {count}
    </button>
  );
}
