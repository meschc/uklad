import { useState } from "react";
import { Check, ChevronUp, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ORIGIN_LABELS,
  STATUS_HINTS,
  STATUS_LABELS,
  STATUS_ORDER,
  TRACK_LABELS,
  type Origin,
  type RoadmapItem,
  type Status,
  type Track,
} from "../../data/roadmap";
import { ROADMAP_ITEMS } from "../../data/roadmapItems";
import { groupByStatus, quarterLabel } from "../../lib/roadmapStats";
import { MAX_VOTES, isVotable, toggleVote, useVotes } from "../../lib/roadmapVotes";
import { c, useT } from "../../lib/copy";
import { Reveal } from "../Reveal";

const T = {
  all: c("Все идеи", "All ideas"),
  filterLabel: c("Темы", "Topics"),
  search: c("Найти на доске", "Search the board"),
  empty: c(
    "Ничего не нашлось. Предложите это идеей ниже",
    "Nothing found. Suggest it as an idea below",
  ),
  releasedIn: c("Вышло в {version}", "Shipped in {version}"),
  unreleased: c("Ждёт выпуска", "Awaiting release"),

  showAll: c("Показать всё готовое: {count}", "Show everything done: {count}"),
  vote: c("Голос", "Vote"),
  voteFor: c("Голос за «{title}»", "Vote for “{title}”"),
  votedFor: c("Отмечено: «{title}». Нажмите, чтобы снять", "Marked: “{title}”. Click to unmark"),
  voteFull: c(
    "Отмечено {max} пунктов. Снимите лишнее, чтобы отметить это",
    "{max} items marked. Unmark something to mark this one",
  ),
  marked: c("Отмечено {count} из {max}.", "{count} of {max} marked."),
  markedSend: c("Отправить голоса", "Send the votes"),
  markedNote: c(
    "Отметки хранятся в этом браузере и дойдут до нас с формой внизу.",
    "The marks live in this browser and reach us with the form below.",
  ),
};

/** Сколько готовых пунктов видно, пока колонка свёрнута. */
const DONE_PREVIEW = 6;

/** Тема в отборе: направление работы или источник пункта. */
type Topic = { kind: "track"; id: Track } | { kind: "origin"; id: Origin };

const sameTopic = (a: Topic | null, b: Topic | null) => a?.kind === b?.kind && a?.id === b?.id;

function matches(item: RoadmapItem, topic: Topic | null, query: string, title: string) {
  if (topic?.kind === "track" && item.track !== topic.id) return false;
  if (topic?.kind === "origin" && item.origin !== topic.id) return false;
  return query === "" || title.toLowerCase().includes(query);
}

/**
 * Доска по образцу taptop: темы сверху, четыре колонки от «Обсуждаем» до
 * «Готово», в карточке — голос, название, суть и теги.
 *
 * В отборе показываются только темы, у которых есть пункты: пустая кнопка
 * «Баги» обещала бы список, которого нет. Появится первый баг — появится и
 * тема, без правки этого файла.
 *
 * Отбор и отметки — состояние браузера, а не страницы: при пререндере показано
 * всё и не отмечено ничего, поэтому поисковику достаётся полная карта.
 */
export function RoadmapBoard() {
  const t = useT();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visible = ROADMAP_ITEMS.filter((item) =>
    matches(item, topic, q, `${t(item.title)} ${t(item.summary)}`),
  );
  const groups = groupByStatus(visible);

  // Отметки читаются один раз на всю доску и раздаются карточкам готовым
  // ответом, а не подпиской в каждой из полусотни карточек.
  const votes = useVotes();
  const marked = new Set(votes);
  const full = votes.length >= MAX_VOTES;

  const topics: Topic[] = [
    ...(Object.keys(ORIGIN_LABELS) as Origin[])
      .filter((id) => ROADMAP_ITEMS.some((item) => item.origin === id))
      .map((id) => ({ kind: "origin" as const, id })),
    ...(Object.keys(TRACK_LABELS) as Track[])
      .filter((id) => ROADMAP_ITEMS.some((item) => item.track === id))
      .map((id) => ({ kind: "track" as const, id })),
  ];

  return (
    <section>
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label={t(T.filterLabel)} className="flex flex-wrap gap-1.5">
          <TopicChip label={t(T.all)} on={topic === null} onClick={() => setTopic(null)} />
          {topics.map((item) => (
            <TopicChip
              key={`${item.kind}-${item.id}`}
              label={t(topicLabel(item))}
              on={sameTopic(topic, item)}
              onClick={() => setTopic(sameTopic(topic, item) ? null : item)}
            />
          ))}
        </div>
        <label className="relative ml-auto w-full sm:w-56">
          <span className="sr-only">{t(T.search)}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t(T.search)}
            className="h-9 w-full rounded-full border border-border bg-background pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-[var(--wh-blue)]"
          />
        </label>
      </div>

      <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {STATUS_ORDER.map((status, index) => (
          <Reveal key={status} delay={index * 70} as="section">
            <Column status={status} items={groups[status]} marked={marked} full={full} />
          </Reveal>
        ))}
      </div>

      {visible.length === 0 && (
        <p className="mt-8 text-center text-sm text-muted-foreground">{t(T.empty)}</p>
      )}

      {votes.length > 0 && (
        <p className="mt-8 text-center text-sm leading-relaxed text-muted-foreground">
          <span className="tabular-nums">
            {t(T.marked, { count: votes.length, max: MAX_VOTES })}
          </span>{" "}
          {t(T.markedNote)}{" "}
          <a
            href="#ideas"
            className="font-medium text-[var(--wh-blue)] underline-offset-4 hover:underline"
          >
            {t(T.markedSend)}
          </a>
        </p>
      )}
    </section>
  );
}

function topicLabel(topic: Topic) {
  return topic.kind === "track" ? TRACK_LABELS[topic.id] : ORIGIN_LABELS[topic.id];
}

function TopicChip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "inline-flex h-8 items-center rounded-full px-3 text-sm font-medium transition-colors",
        on
          ? "bg-[var(--wh-blue)] text-[var(--wh-on-blue)]"
          : "text-muted-foreground hover:bg-[var(--wh-soft)] hover:text-foreground",
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
  marked: ReadonlySet<string>;
  full: boolean;
}) {
  const t = useT();
  // Готового много и становится всё больше: колонка показывает последнее, а
  // остальное раскрывается по кнопке — иначе доска уходит на семь экранов.
  const [open, setOpen] = useState(false);
  const cut = status === "done" && !open && items.length > DONE_PREVIEW;
  const shown = cut
    ? items.slice(-DONE_PREVIEW).reverse()
    : status === "done"
      ? [...items].reverse()
      : items;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-baseline gap-2 border-b border-border pb-2">
        <h3 className="text-base font-heading tracking-tight">{t(STATUS_LABELS[status])}</h3>
        <span className="text-sm tabular-nums text-muted-foreground">{items.length}</span>
      </div>
      <p className="mt-2 text-xs leading-snug text-muted-foreground">{t(STATUS_HINTS[status])}</p>

      <ul className="mt-3 flex flex-col gap-3">
        {shown.map((item) => (
          <li key={item.id}>
            <Card item={item} voted={marked.has(item.id)} full={full} />
          </li>
        ))}
      </ul>
      {cut && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 h-9 rounded-full bg-[var(--wh-soft)] text-sm font-medium transition-colors hover:text-[var(--wh-blue)]"
        >
          {t(T.showAll, { count: items.length })}
        </button>
      )}
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
    <article className="r-window h-full border border-[var(--wh-line)] bg-[var(--wh-tile)] p-4 transition-shadow hover:shadow-sm">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {isVotable(item) && <VoteButton item={item} voted={voted} full={full} />}
        {note && <span className="ml-auto tabular-nums">{note}</span>}
      </div>
      <h4 className="mt-2 text-sm font-heading leading-snug">{t(item.title)}</h4>
      <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
        {t(item.summary)}
      </p>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium">
        <span className="text-[var(--wh-blue)]">{t(TRACK_LABELS[item.track])}</span>
        {item.origin && <span className="text-foreground/70">{t(ORIGIN_LABELS[item.origin])}</span>}
      </div>
    </article>
  );
}

/**
 * Голос — стрелка вверх, как у taptop, но без общего числа: сложить голоса
 * всех посетителей негде, а нарисованная цифра выглядела бы как настоящая
 * (см. `lib/roadmapVotes`). Название пункта уходит в `aria-label` целиком.
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
        "r-chip inline-flex h-8 shrink-0 items-center gap-1 px-2.5 text-xs font-medium transition-colors",
        voted
          ? "bg-[var(--wh-blue)] text-[var(--wh-on-blue)]"
          : "bg-[var(--wh-soft)] text-foreground enabled:hover:text-[var(--wh-blue)] disabled:opacity-40",
      )}
    >
      {voted ? <Check className="size-3.5" strokeWidth={3} /> : <ChevronUp className="size-3.5" />}
      {t(T.vote)}
    </button>
  );
}
