import { Check } from "lucide-react";
import { RELEASES, type Release } from "../../data/roadmap";
import { shortDate } from "../../lib/date";
import { c, useT } from "../../lib/copy";
import { Reveal } from "../Reveal";

const T = {
  pending: c(
    "Всё, что сделано после этого выпуска, лежит на доске как готовое, но без номера версии: оно работает, а выложено ещё не было.",
    "Everything finished since that release sits on the board as done but without a version number: it works, it just has not shipped yet.",
  ),
};

/**
 * Журнал выпусков.
 *
 * Повторяет `CHANGELOG.md` и не опережает его: выпуск появляется здесь только
 * после того, как появился там. Это единственная защита от расхождения — два
 * списка обновлений, которые ведут по отдельности, расходятся всегда.
 *
 * Выпуск пока один, и показывать один — честнее, чем растянуть историю на три
 * ради ощущения движения.
 */
export function RoadmapChangelog() {
  const t = useT();

  return (
    <div className="mx-auto max-w-3xl">
      <ol className="flex flex-col gap-5">
        {RELEASES.map((release, index) => (
          <Reveal key={release.version} delay={index * 70} as="li">
            <ReleaseCard release={release} />
          </Reveal>
        ))}
      </ol>
      <p className="mt-6 text-[13px] leading-relaxed text-muted-foreground">{t(T.pending)}</p>
    </div>
  );
}

function ReleaseCard({ release }: { release: Release }) {
  const t = useT();
  // Дата разбирается как полдень UTC: «2026-09-02» — это день, а не момент, и
  // в часовых поясах западнее Гринвича полночь съезжает на первое сентября.
  const at = Date.parse(`${release.date}T12:00:00Z`);

  return (
    <article className="r-window border border-border bg-card/60 p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="rounded-full border border-primary/40 px-2.5 py-0.5 text-[11px] font-bold tabular-nums tracking-wide text-primary">
          {release.version}
        </span>
        <h3 className="font-display text-[18px] font-medium tracking-tight">{t(release.title)}</h3>
        <time
          dateTime={release.date}
          className="ml-auto text-[12px] tabular-nums text-muted-foreground"
        >
          {shortDate(t.lang, at)}
        </time>
      </div>

      <ul className="mt-4 flex flex-col gap-2.5">
        {release.highlights.map((highlight) => (
          <li key={highlight.ru} className="flex gap-2.5 text-[13px] leading-relaxed">
            <Check className="mt-0.5 size-3.5 shrink-0 text-primary" strokeWidth={3} />
            <span className="text-foreground/85">{t(highlight)}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
