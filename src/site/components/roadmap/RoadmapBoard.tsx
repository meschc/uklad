import { useState } from "react";
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
import { c, useT } from "../../lib/copy";
import { Reveal } from "../Reveal";

const T = {
  all: c("Всё", "Everything"),
  filterLabel: c("Направление работы", "Area of work"),
  empty: c("В этом направлении сюда пока ничего не попало", "Nothing here in this area yet"),
  releasedIn: c("Вышло в {version}", "Shipped in {version}"),
  unreleased: c("Готово, ждёт выпуска", "Done, awaiting release"),
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
 * Отбор — состояние компонента, и это нарочно единственное состояние на всей
 * странице: при пререндере показано всё, поэтому поисковику и человеку без
 * скриптов достаётся полная карта, а не пустая доска с кнопками.
 */
export function RoadmapBoard() {
  const t = useT();
  const [track, setTrack] = useState<Track | null>(null);
  const visible = filterByTrack(ROADMAP_ITEMS, track);
  const groups = groupByStatus(visible);

  return (
    <section>
      <TrackFilter value={track} onChange={setTrack} />

      <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {STATUS_ORDER.map((status, index) => (
          <Reveal key={status} delay={index * 70} as="section">
            <Column status={status} items={groups[status]} />
          </Reveal>
        ))}
      </div>

      {visible.length === 0 && (
        <p className="mt-8 text-center text-[14px] text-muted-foreground">{t(T.empty)}</p>
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

function Column({ status, items }: { status: Status; items: RoadmapItem[] }) {
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
            <Card item={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Card({ item }: { item: RoadmapItem }) {
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
      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        <span className="rounded-full border border-border px-2 py-0.5">
          {t(TRACK_LABELS[item.track])}
        </span>
        {note && <span className="tabular-nums">{note}</span>}
      </p>
    </article>
  );
}
