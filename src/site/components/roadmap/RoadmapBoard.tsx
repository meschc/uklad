import { useEffect, useState } from "react";
import { Search } from "lucide-react";
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
import { useRoadmap } from "../../lib/roadmap/store";
import { RoadmapVote } from "./RoadmapVote";
import { c, useT } from "../../lib/copy";
import { Reveal } from "../Reveal";
import { RoadmapIdea } from "./RoadmapIdea";
import { ORIGIN_TONE, STATUS_TONE, TRACK_TONE, TRACK_COLORS, ORIGIN_COLORS } from "./roadmapColors";

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
  mine: c("Мои голоса", "My votes"),
};

/** Сколько готовых пунктов видно, пока колонка свёрнута. */
const DONE_PREVIEW = 6;

/** Тема в отборе: направление работы или источник пункта. */
type Topic =
  { kind: "track"; id: Track } | { kind: "origin"; id: Origin } | { kind: "mine"; id: "mine" };

const sameTopic = (a: Topic | null, b: Topic | null) => a?.kind === b?.kind && a?.id === b?.id;

function matches(
  item: RoadmapItem,
  topic: Topic | null,
  query: string,
  title: string,
  mine: ReadonlyMap<string, 1 | -1>,
) {
  if (topic?.kind === "mine" && !mine.has(item.id)) return false;
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
  // Голоса читаются один раз на всю доску и раздаются карточкам готовым
  // ответом, а не подпиской в каждой из полусотни карточек.
  const { mine, counts, session } = useRoadmap();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visible = ROADMAP_ITEMS.filter((item) =>
    matches(item, topic, q, `${t(item.title)} ${t(item.summary)}`, mine),
  );
  const groups = groupByStatus(visible);

  // Открытая идея живёт в адресе (#idea-<id>), как у taptop своя ссылка у
  // каждой идеи: её можно переслать, и «назад» в браузере закрывает окно.
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    const read = () => {
      const match = /^#idea-(.+)$/.exec(window.location.hash);
      // Битый адрес (#idea-%E0) не должен ронять страницу: просто без окна.
      let id: string | null = null;
      try {
        id = match ? decodeURIComponent(match[1]) : null;
      } catch {
        id = null;
      }
      setOpenId(id);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const openItem = ROADMAP_ITEMS.find((item) => item.id === openId);
  const close = () => {
    history.pushState(null, "", window.location.pathname + window.location.search);
    setOpenId(null);
  };

  const topics: Topic[] = [
    // «Мои голоса» — первой темой, как только есть за что: вошедший человек
    // чаще всего возвращается посмотреть, сдвинулось ли то, за что он голосовал.
    ...(session && mine.size > 0 ? [{ kind: "mine" as const, id: "mine" as const }] : []),
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
              color={
                item.kind === "track"
                  ? TRACK_COLORS[item.id]
                  : item.kind === "origin"
                    ? ORIGIN_COLORS[item.id]
                    : TRACK_COLORS.plan
              }
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
            <Column status={status} items={groups[status]} mine={mine} counts={counts} />
          </Reveal>
        ))}
      </div>

      {visible.length === 0 && (
        <p className="mt-8 text-center text-sm text-muted-foreground">{t(T.empty)}</p>
      )}

      {openItem && (
        <RoadmapIdea
          item={openItem}
          onClose={close}
          vote={
            isVotable(openItem) ? (
              <RoadmapVote
                item={openItem}
                my={mine.get(openItem.id) ?? 0}
                count={counts[openItem.id] ?? 0}
                size="lg"
              />
            ) : null
          }
        />
      )}
    </section>
  );
}

function topicLabel(topic: Topic) {
  if (topic.kind === "mine") return T.mine;
  return topic.kind === "track" ? TRACK_LABELS[topic.id] : ORIGIN_LABELS[topic.id];
}

function TopicChip({
  label,
  on,
  onClick,
  color,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  /** Цвет темы — тот же, что у тега на карточке; выбранный залит им же. */
  color?: { dot: string; fill: string; hover: string };
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors",
        on
          ? (color?.fill ?? "bg-[var(--wh-ink)] text-[var(--wh-ground)]")
          : cn("text-[var(--wh-ink)]", color?.hover ?? "hover:bg-[var(--wh-soft)]"),
      )}
    >
      {color && !on && <span aria-hidden className={cn("size-2 rounded-full", color.dot)} />}
      {label}
    </button>
  );
}

function Column({
  status,
  items,
  mine,
  counts,
}: {
  status: Status;
  items: RoadmapItem[];
  mine: ReadonlyMap<string, 1 | -1>;
  counts: Record<string, number>;
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
        <span className={cn("size-2.5 shrink-0 self-center rounded-full", STATUS_TONE[status])} />
        <h3 className="text-base font-heading tracking-tight">{t(STATUS_LABELS[status])}</h3>
        <span className="text-sm tabular-nums text-muted-foreground">{items.length}</span>
      </div>
      <p className="mt-2 text-xs leading-snug text-muted-foreground">{t(STATUS_HINTS[status])}</p>

      <ul className="mt-3 flex flex-col gap-3">
        {shown.map((item) => (
          <li key={item.id}>
            <Card item={item} my={mine.get(item.id) ?? 0} count={counts[item.id] ?? 0} />
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

function Card({ item, my, count }: { item: RoadmapItem; my: 0 | 1 | -1; count: number }) {
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
    <article className="r-window relative h-full border border-[var(--wh-line)] bg-[var(--wh-tile)] p-4 transition-colors hover:border-[var(--wh-blue)]">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {isVotable(item) && <RoadmapVote item={item} my={my} count={count} />}
        {note && <span className="ml-auto tabular-nums">{note}</span>}
      </div>
      <h4 className="mt-2 text-sm font-heading leading-snug">
        {/* Вся карточка открывает идею: кнопка-заголовок растянута на неё
            псевдоэлементом, голос лежит выше слоем и жмётся отдельно. */}
        <a
          href={`#idea-${encodeURIComponent(item.id)}`}
          className="after:absolute after:inset-0 after:rounded-[inherit] hover:text-[var(--wh-blue)] focus-visible:outline-none"
        >
          {t(item.title)}
        </a>
      </h4>
      <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
        {t(item.summary)}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className={TRACK_TONE[item.track]}>{t(TRACK_LABELS[item.track])}</span>
        {item.origin && (
          <span className={ORIGIN_TONE[item.origin]}>{t(ORIGIN_LABELS[item.origin])}</span>
        )}
      </div>
    </article>
  );
}

/** За готовое не голосуют: оно уже работает, и голос ничего не сдвинет. */
function isVotable(item: RoadmapItem): boolean {
  return item.status !== "done";
}
