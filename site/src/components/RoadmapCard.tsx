import { ChevronUp } from "lucide-react";
import type { RoadmapItem } from "@/data/types";
import { STATUS_LABELS, TRACK_LABELS } from "@/data/roadmap";
import { formatDate, formatQuarter } from "@/lib/roadmap";
import { noOrphans } from "@/lib/typography";
import { Badge, STATUS_ICONS, STATUS_STYLE } from "./ui";
import { cn } from "@/lib/utils";

/**
 * Карточка пункта роадмапа.
 *
 * Голос — единственное действие: остальное человек прочитает и уйдёт. Кнопка
 * стоит слева от заголовка колонкой, как в трекерах задач, потому что взгляд
 * при сравнении пунктов идёт по числам сверху вниз, а не по заголовкам.
 *
 * У готового пункта на месте квартала стоит дата выхода: ориентир, по которому
 * работу планировали, после выпуска никому не интересен.
 */
export function RoadmapCard({
  item,
  voted,
  onVote,
  showStatus,
}: {
  item: RoadmapItem;
  voted: boolean;
  onVote: (id: string) => void;
  /** На таймлайне колонок нет, и стадию приходится подписывать на карточке. */
  showStatus?: boolean;
}) {
  const Icon = STATUS_ICONS[item.status];
  const done = item.status === "done";

  return (
    <article className="flex animate-rise-in gap-2.5 rounded-xl border border-border bg-card p-3.5 transition-[border-color,box-shadow] hover:border-foreground/20 hover:shadow-sm">
      <button
        type="button"
        aria-pressed={voted}
        aria-label={voted ? `Убрать голос за «${item.title}»` : `Голосовать за «${item.title}»`}
        onClick={() => onVote(item.id)}
        className={cn(
          "flex h-12 w-10 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          voted
            ? "border-primary/40 bg-primary/10 text-primary"
            : "border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground",
        )}
      >
        <ChevronUp className="size-4" />
        <span className="text-xs font-semibold tabular-nums">{item.votes + (voted ? 1 : 0)}</span>
      </button>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          {showStatus && (
            <Badge className={STATUS_STYLE[item.status].chip}>
              <Icon />
              {STATUS_LABELS[item.status]}
            </Badge>
          )}
          <Badge>{TRACK_LABELS[item.track]}</Badge>
          <Badge title={done ? "Дата выхода" : "Ориентир, а не обещание"}>
            {done && item.shippedAt ? formatDate(item.shippedAt) : formatQuarter(item.quarter)}
          </Badge>
          {done && item.version && <Badge>v{item.version}</Badge>}
        </div>

        <h4 className="mt-2 font-medium leading-snug tracking-tight">{item.title}</h4>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {noOrphans(item.summary)}
        </p>
      </div>
    </article>
  );
}
