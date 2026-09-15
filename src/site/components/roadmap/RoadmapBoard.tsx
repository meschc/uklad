import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  STATUS_HINTS,
  STATUS_LABELS,
  STATUS_ORDER,
  TRACK_LABELS,
  type RoadmapItem,
  type Status,
  type Track,
} from "../../data/roadmap";
import { ROADMAP_ITEMS } from "../../data/roadmapItems";
import { filterByTrack, groupByStatus, quarterLabel } from "../../lib/roadmapStats";
import { MAX_VOTES, isVotable, toggleVote, useVotes } from "../../lib/roadmapVotes";
import { c, useT } from "../../lib/copy";
import { Reveal } from "../Reveal";

const T = {
  all: c("Всё", "Everything"),
  filterLabel: c("Направление работы", "Area of work"),
  empty: c("В этом направлении сюда пока ничего не попало", "Nothing here in this area yet"),
  releasedIn: c("Вышло в {version}", "Shipped in {version}"),
  unreleased: c("Готово, ждёт выпуска", "Done, awaiting release"),

  vote: c("Голос", "Vote"),
  voted: c("Отмечено", "Marked"),
  voteFor: c("Голос за «{title}»", "Vote for “{title}”"),
  votedFor: c("Отмечено: «{title}». Нажмите, чтобы снять", "Marked: “{title}”. Click to unmark"),
  voteFull: c(
    "Отмечено {max} пунктов — снимите лишнее, чтобы отметить это",
    "{max} items marked — unmark something to mark this one",
  ),
  marked: c("Отмечено {count} из {max}.", "{count} of {max} marked."),
  markedSend: c("Отправить голоса", "Send the votes"),
  markedNote: c(
    "Отметки лежат в этом браузере: до нас они дойдут только с формой внизу.",
    "The marks live in this browser: they reach us only with the form below.",
  ),
};

/**
 * Оформление стадии. Цвета взяты из палитры витрины, а не заведены свои:
 * стадия — это вес, а не новый цвет, и различаются колонки заливкой точки, от
 * сплошной у готового до пустой у идеи. Отдельная палитра под роадмап означала
 * бы, что маркетинговая страница диктует токены всему продукту.
 */
const STATUS_DOT: Record<Status, string> = {
  done: "bg-primary",
  progress: "bg-primary/55",
  planned: "bg-muted-foreground/60",
  idea: "border border-muted-foreground/60 bg-transparent",
};

/** Рамка карточки: готовое подсвечено, остальное тем тише, чем оно дальше. */
const STATUS_CARD: Record<Status, string> = {
  done: "border-primary/25 bg-card",
  progress: "border-primary/25 bg-card",
  planned: "border-border bg-card/70",
  idea: "border-border/60 bg-card/40",
};

/**
 * Доска: четыре колонки по стадиям и отбор по направлению.
 *
 * Колонки, а не единый список с подписями: вопрос, ради которого страницу
 * открывают, звучит «что уже работает, а что вы только обещаете», и ответ на
 * него должен читаться одним взглядом, без чтения строк.
 *
 * Отбор и отметки — состояние браузера, а не страницы: при пререндере показано
 * всё и не отмечено ничего, поэтому поисковику и человеку без скриптов
 * достаётся полная карта, а не пустая доска с кнопками.
 */
export function RoadmapBoard() {
  const t = useT();
  const [track, setTrack] = useState<Track | null>(null);
  const visible = filterByTrack(ROADMAP_ITEMS, track);
  const groups = groupByStatus(visible);

  // Отметки читаются один раз на всю доску и раздаются карточкам готовым
  // ответом. Подписка в каждой карточке дала бы полсотни подписок на один и
  // тот же список — ради булева значения, которое считается тут же.
  const votes = useVotes();
  const marked = new Set(votes);
  const full = votes.length >= MAX_VOTES;

  return (
    <section>
      <TrackFilter value={track} onChange={setTrack} />

      <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {STATUS_ORDER.map((status, index) => (
          <Reveal key={status} delay={index * 70} as="section">
            <Column status={status} items={groups[status]} marked={marked} full={full} />
          </Reveal>
        ))}
      </div>

      {visible.length === 0 && (
        <p className="mt-8 text-center text-[14px] text-muted-foreground">{t(T.empty)}</p>
      )}

      {votes.length > 0 && (
        <p className="mt-8 text-center text-[13px] leading-relaxed text-muted-foreground">
          <span className="tabular-nums">
            {t(T.marked, { count: votes.length, max: MAX_VOTES })}
          </span>{" "}
          {t(T.markedNote)}{" "}
          <a href="#ideas" className="font-medium text-primary underline-offset-4 hover:underline">
            {t(T.markedSend)}
          </a>
        </p>
      )}
    </section>
  );
}

function TrackFilter({
  value,
  onChange,
}: {
  value: Track | null;
  onChange: (track: Track | null) => void;
}) {
  const t = useT();
  const tracks = Object.keys(TRACK_LABELS) as Track[];

  return (
    <div role="group" aria-label={t(T.filterLabel)} className="flex flex-wrap justify-center gap-2">
      <TrackChip label={t(T.all)} on={value === null} onClick={() => onChange(null)} />
      {tracks.map((track) => (
        <TrackChip
          key={track}
          label={t(TRACK_LABELS[track])}
          on={value === track}
          onClick={() => onChange(track)}
        />
      ))}
    </div>
  );
}

function TrackChip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "inline-flex h-9 items-center rounded-full border px-4 text-[13px] font-medium transition-colors",
        on
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function Column({
  status,
  items,
  marked,
  full,
}: {
  status: Status;
  items: RoadmapItem[];
  /** Отмеченные пункты — общий на доску набор, см. `RoadmapBoard`. */
  marked: ReadonlySet<string>;
  /** Отмечено предельное число пунктов: новые кнопки заблокированы. */
  full: boolean;
}) {
  const t = useT();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-baseline gap-2">
        <span className={cn("size-2 shrink-0 self-center rounded-full", STATUS_DOT[status])} />
        <h3 className="font-display text-[16px] font-medium tracking-tight">
          {t(STATUS_LABELS[status])}
        </h3>
        <span className="ml-auto text-[13px] tabular-nums text-muted-foreground">
          {items.length}
        </span>
      </div>
      <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
        {t(STATUS_HINTS[status])}
      </p>

      <ul className="mt-4 flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.id}>
            <Card item={item} voted={marked.has(item.id)} full={full} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Card({ item, voted, full }: { item: RoadmapItem; voted: boolean; full: boolean }) {
  const t = useT();
  // Готовому без версии подпись нужна не меньше, чем выпущенному: иначе
  // «готово» читается как «уже у вас», хотя выложено этого ещё не было.
  const note =
    item.status === "done"
      ? item.version
        ? t(T.releasedIn, { version: item.version })
        : t(T.unreleased)
      : item.quarter
        ? quarterLabel(t.lang, item.quarter)
        : null;

  return (
    <article
      className={cn("r-window h-full border p-4 transition-colors", STATUS_CARD[item.status])}
    >
      <h4 className="text-[14px] font-medium leading-snug">{t(item.title)}</h4>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{t(item.summary)}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2 text-[11px] text-muted-foreground">
        <span className="rounded-full border border-border px-2 py-0.5">
          {t(TRACK_LABELS[item.track])}
        </span>
        {note && <span className="tabular-nums">{note}</span>}
        {isVotable(item) && <VoteButton item={item} voted={voted} full={full} />}
      </div>
    </article>
  );
}

/**
 * Кнопка голоса на карточке.
 *
 * Подпись меняется с «Голос» на «Отмечено», а не на «Учтено»: нажатие пока
 * только запомнило выбор в этом браузере, и обещать большее кнопка не вправе —
 * до нас голос доедет формой внизу страницы (см. `lib/roadmapVotes`).
 *
 * Название пункта уходит в `aria-label` целиком: на доске таких кнопок полсотни,
 * и подряд идущие «Голос, Голос, Голос» в программе чтения с экрана не говорят
 * ни о чём. Видимая подпись входит в него словом — иначе голосовое управление
 * перестаёт находить кнопку по тому, что человек на ней читает.
 */
function VoteButton({ item, voted, full }: { item: RoadmapItem; voted: boolean; full: boolean }) {
  const t = useT();
  const title = t(item.title);
  const blocked = full && !voted;

  return (
    <button
      type="button"
      onClick={() => toggleVote(item.id)}
      disabled={blocked}
      aria-pressed={voted}
      aria-label={t(voted ? T.votedFor : T.voteFor, { title })}
      title={blocked ? t(T.voteFull, { max: MAX_VOTES }) : undefined}
      className={cn(
        "r-chip ml-auto inline-flex h-7 shrink-0 items-center gap-1 border px-2 text-[11px] font-medium transition-colors",
        voted
          ? "border-primary bg-primary/10 text-primary"
          : "border-border enabled:hover:border-primary/40 enabled:hover:text-foreground disabled:opacity-40",
      )}
    >
      {voted ? <Check className="size-3" strokeWidth={3} /> : <Plus className="size-3" />}
      {t(voted ? T.voted : T.vote)}
    </button>
  );
}
