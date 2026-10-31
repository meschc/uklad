import { cn } from "@/lib/utils";
import { TRACK_LABELS } from "../../data/roadmap";
import { ru, useT } from "../../lib/copy";
import { shortDate } from "../../lib/date";
import { useRoadmap } from "../../lib/roadmap/store";
import type { SubmittedIdea } from "../../lib/roadmap/port";
import { TRACK_TONE } from "./roadmapColors";

const T = {
  title: ru("Мои идеи"),
  review: ru("На рассмотрении"),
  accepted: ru("Принята, на доске"),
  declined: ru("Отклонена"),
};

const STATUS: Record<SubmittedIdea["status"], { label: typeof T.review; dot: string }> = {
  review: { label: T.review, dot: "bg-[#f59e0b]" },
  accepted: { label: T.accepted, dot: "bg-[#16a34a]" },
  declined: { label: T.declined, dot: "bg-[var(--wh-muted)]" },
};

/** Присланные идеи видны автору сразу, остальным — после разбора. */
export function RoadmapMyIdeas() {
  const t = useT();
  const { ideas } = useRoadmap();
  if (ideas.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="text-sm font-heading">{t(T.title)}</h2>
      <ul className="mt-2 space-y-2">
        {ideas.map((idea) => (
          <li
            key={idea.id}
            className="rounded-xl border border-[var(--wh-line)] bg-[var(--wh-tile)] p-3 text-sm"
          >
            <p className="font-medium leading-snug">{idea.title}</p>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-[var(--wh-muted)]">
              <span className={cn("size-2 rounded-full", STATUS[idea.status].dot)} />
              {t(STATUS[idea.status].label)}
              <span className="tabular-nums">
                · {shortDate(t.lang, Date.parse(idea.createdAt))}
              </span>
              {idea.track && (
                <span className={TRACK_TONE[idea.track]}>{t(TRACK_LABELS[idea.track])}</span>
              )}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
