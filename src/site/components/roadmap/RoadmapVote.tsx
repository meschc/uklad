import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RoadmapItem } from "../../data/roadmap";
import { castVote } from "../../lib/roadmap/store";
import { c, useT } from "../../lib/copy";

const T = {
  up: c("Голос за «{title}», итог {count}", "Vote for “{title}”, total {count}"),
  down: c("Голос против «{title}», итог {count}", "Vote against “{title}”, total {count}"),
  upOn: c(
    "Вы голосовали за «{title}», итог {count}. Нажмите, чтобы снять",
    "You voted for “{title}”, total {count}. Click to remove",
  ),
  downOn: c(
    "Вы голосовали против «{title}», итог {count}. Нажмите, чтобы снять",
    "You voted against “{title}”, total {count}. Click to remove",
  ),
};

/**
 * Голос двумя стрелками вокруг общего итога («за» минус «против»). Нажатие
 * засчитывается сразу; повторное нажатие той же стрелки снимает голос,
 * противоположной — переставляет. Отдельного счётчика «против» нет: на
 * публичной доске он отпугивает и ничего не добавляет к итогу.
 *
 * Название пункта уходит в `aria-label` целиком: на доске таких кнопок
 * полсотни, и подряд идущие «12, 4, 7» ни о чём не говорят.
 */
export function RoadmapVote({
  item,
  my,
  count,
  size = "sm",
}: {
  item: RoadmapItem;
  /** Свой голос: 1 — за, -1 — против, 0 — нет. */
  my: 0 | 1 | -1;
  count: number;
  size?: "sm" | "lg";
}) {
  const t = useT();
  const title = t(item.title);
  const icon = size === "lg" ? "size-4" : "size-3.5";
  const arrow = (dir: 1 | -1) => {
    const on = my === dir;
    const label = dir === 1 ? (on ? T.upOn : T.up) : on ? T.downOn : T.down;
    const Icon = dir === 1 ? ChevronUp : ChevronDown;
    return (
      <button
        type="button"
        onClick={() => castVote(item.id, dir)}
        aria-pressed={on}
        aria-label={t(label, { title, count })}
        className={cn(
          "grid place-items-center rounded-full transition-colors",
          size === "lg" ? "size-8" : "size-6",
          on
            ? "bg-[var(--wh-blue)] text-[var(--wh-on-blue)]"
            : "text-muted-foreground hover:text-[var(--wh-blue)]",
        )}
      >
        <Icon className={icon} strokeWidth={2.5} />
      </button>
    );
  };

  return (
    <span
      className={cn(
        "r-chip relative z-10 inline-flex shrink-0 items-center gap-0.5 bg-[var(--wh-soft)] p-0.5 font-medium tabular-nums shadow-[inset_0_0_0_1px_var(--wh-line)]",
        size === "lg" ? "text-sm" : "text-xs",
      )}
    >
      {arrow(1)}
      <span className="min-w-5 text-center">{count}</span>
      {arrow(-1)}
    </span>
  );
}
