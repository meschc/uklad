import { MILESTONES } from "../../data/roadmap";
import { ROADMAP_ITEMS } from "../../data/roadmapItems";
import { milestonesProgress, quarterLabel, type MilestoneProgress } from "../../lib/roadmapStats";
import { c, useT } from "../../lib/copy";
import { Reveal } from "../Reveal";

const T = {
  done: c("готово", "done"),
  inProgress: c("в работе", "in progress"),
  ofTotal: c("{done} из {total}", "{done} of {total}"),
  finished: c("Завершена", "Finished"),
  barLabel: c("Готово {done} из {total} пунктов", "{done} of {total} items done"),
};

/**
 * Вехи — ответ на вопрос «когда», доска отвечает на вопрос «что».
 *
 * Разделено потому, что это два разных чтения. Доску читает тот, кто ищет
 * конкретную функцию; вехи — тот, кто решает, ждать ли ему продукта вообще.
 * Одним списком эти два чтения мешают друг другу: сроки тонут в сорока
 * строчках, а строчки теряются между сроками.
 */
export function RoadmapMilestones() {
  const rows = milestonesProgress(MILESTONES, ROADMAP_ITEMS);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {rows.map((row, index) => (
        <Reveal key={row.milestone.id} delay={index * 60} className="h-full">
          <MilestoneCard row={row} />
        </Reveal>
      ))}
    </div>
  );
}

function MilestoneCard({ row }: { row: MilestoneProgress }) {
  const t = useT();
  const { milestone, done, progress, total } = row;

  return (
    <article className="r-window flex h-full flex-col border border-border bg-card/60 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-[17px] font-medium tracking-tight">
          {t(milestone.title)}
        </h3>
        <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
          {milestone.target ? quarterLabel(t.lang, milestone.target) : t(T.finished)}
        </span>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{t(milestone.goal)}</p>

      <div className="mt-auto pt-5">
        <ProgressBar row={row} />
        <p className="mt-2 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
          <span className="tabular-nums">
            {t(T.ofTotal, { done, total })} {t(T.done)}
          </span>
          {progress > 0 && (
            <span className="tabular-nums">
              {progress} {t(T.inProgress)}
            </span>
          )}
        </p>
      </div>
    </article>
  );
}

/**
 * Полоса из двух отрезков: сплошной — сделанное, полупрозрачный — начатое.
 *
 * Складывать их в одну долю нельзя: веха с одним готовым пунктом и девятью
 * начатыми выглядела бы почти законченной, хотя не отгружено ничего.
 */
function ProgressBar({ row }: { row: MilestoneProgress }) {
  const t = useT();

  return (
    <div
      role="img"
      aria-label={t(T.barLabel, { done: row.done, total: row.total })}
      className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted"
    >
      <span className="h-full bg-primary" style={{ width: `${row.donePercent}%` }} />
      <span className="h-full bg-primary/35" style={{ width: `${row.progressPercent}%` }} />
    </div>
  );
}
