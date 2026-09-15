import { Target } from "lucide-react";
import type { RoadmapItem, Status } from "@/data/types";
import { MILESTONES, STATUS_HINTS, STATUS_LABELS } from "@/data/roadmap";
import {
  countByStatus,
  formatQuarter,
  milestoneProgress,
  plural,
  progressOf,
  STATUS_ORDER,
} from "@/lib/roadmap";
import { noOrphans } from "@/lib/typography";
import { Progress, SplitProgress, STATUS_ICONS, STATUS_STYLE } from "./ui";
import { cn } from "@/lib/utils";

/**
 * Дашборд статусов работ — верхняя половина витрины.
 *
 * Отвечает на три вопроса в порядке, в котором их задают: сколько всего уже в
 * продукте, чем заняты прямо сейчас и к какому крупному этапу это ведёт.
 * Числа не рисуются руками — считаются из того же массива, что и борд ниже,
 * иначе страница начнёт спорить сама с собой.
 *
 * Плитка стадии — это ещё и фильтр борда: человек, увидев «в работе 4»,
 * первым делом хочет узнать, что это за четыре.
 */
export function StatusDashboard({
  items,
  active,
  onPick,
}: {
  items: RoadmapItem[];
  /** Выбранная стадия или null — тогда борд показывает все колонки. */
  active: Status | null;
  onPick: (status: Status | null) => void;
}) {
  const counts = countByStatus(items);
  const total = progressOf(items);

  return (
    <section id="status" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Статус работ</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            {noOrphans(
              "Один и тот же список задач для всей страницы: плитка показывает, сколько их в стадии, и открывает эти задачи на борде ниже.",
            )}
          </p>
        </div>
        <div className="min-w-[13rem] flex-1 sm:max-w-xs">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm text-muted-foreground">В продукте</span>
            <span className="text-sm font-medium tabular-nums">
              {total.done} из {total.total} · {total.percent}%
            </span>
          </div>
          <Progress
            percent={total.percent}
            className="mt-2 h-2"
            barClassName={STATUS_STYLE.done.bar}
          />
        </div>
      </header>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STATUS_ORDER.map((status) => {
          const Icon = STATUS_ICONS[status];
          const picked = active === status;
          const n = counts[status];
          return (
            <button
              key={status}
              type="button"
              aria-pressed={picked}
              onClick={() => onPick(picked ? null : status)}
              className={cn(
                "group rounded-xl border bg-card p-4 text-left transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                picked ? "border-foreground/30 shadow-sm" : "border-border",
              )}
            >
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium",
                  STATUS_STYLE[status].chip,
                )}
              >
                <Icon className="size-3.5" />
                {STATUS_LABELS[status]}
              </span>
              <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight">{n}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {plural(n, ["задача", "задачи", "задач"])} · {STATUS_HINTS[status]}
              </p>
            </button>
          );
        })}
      </div>

      <h3 className="mt-12 flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Target className="size-4" />
        Крупные этапы
      </h3>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {MILESTONES.map((m) => {
          const p = milestoneProgress(items, m);
          return (
            <article key={m.id} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <h4 className="font-medium tracking-tight">{m.title}</h4>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatQuarter(m.target)}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{noOrphans(m.goal)}</p>
              {/* Процент показываем только у завершённой вехи: рядом с полосой,
                  где есть ещё и сегмент «в работе», «0%» читается как «полоса
                  пустая», хотя она не пустая. Счёт задач честнее процента. */}
              <div className="mt-4 flex items-baseline justify-between gap-2 text-xs">
                <span className="text-muted-foreground">
                  Готово {p.done} из {p.total}
                  {p.inProgress > 0 && `, в работе ${p.inProgress}`}
                </span>
                {p.percent === 100 && (
                  <span className="font-medium text-[hsl(var(--st-done))]">Этап закрыт</span>
                )}
              </div>
              <SplitProgress
                done={p.percent}
                inProgress={p.percentInProgress}
                className="mt-1.5"
              />
            </article>
          );
        })}
      </div>
    </section>
  );
}
