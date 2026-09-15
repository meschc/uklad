import { useMemo, useState } from "react";
import { Columns3, Rows3, Search, X } from "lucide-react";
import type { RoadmapItem, Status, Track } from "@/data/types";
import { STATUS_HINTS, STATUS_LABELS, TRACK_LABELS } from "@/data/roadmap";
import {
  byQuarter,
  filterItems,
  formatQuarter,
  groupByStatus,
  plural,
  STATUS_ORDER,
} from "@/lib/roadmap";
import { readVotes, toggleVote, type Votes } from "@/lib/votes";
import { noOrphans } from "@/lib/typography";
import { RoadmapCard } from "./RoadmapCard";
import { Badge, Button, Segmented, STATUS_ICONS, STATUS_STYLE } from "./ui";
import { cn } from "@/lib/utils";

type View = "board" | "timeline";

const VIEWS = [
  { value: "board" as const, label: "Колонки", icon: <Columns3 /> },
  { value: "timeline" as const, label: "По кварталам", icon: <Rows3 /> },
];

const TRACKS: (Track | "all")[] = ["all", "plan", "fulfillment", "integrations", "platform"];

/**
 * Роадмап: тот же список в двух видах.
 *
 * Колонки отвечают на вопрос «чем заняты», кварталы — «когда будет». Это
 * разные вопросы, и сводить их в один вид нечестно: на борде исчезает время,
 * на таймлайне — стадия, поэтому на карточках таймлайна стадия подписана.
 *
 * Фильтр по стадии живёт снаружи (его же переключают плитки дашборда): у
 * страницы одно состояние выбора, а не два спорящих.
 */
export function RoadmapSection({
  items,
  status,
  onStatusChange,
}: {
  items: RoadmapItem[];
  status: Status | null;
  onStatusChange: (status: Status | null) => void;
}) {
  const [view, setView] = useState<View>("board");
  const [track, setTrack] = useState<Track | "all">("all");
  const [query, setQuery] = useState("");
  const [votes, setVotes] = useState<Votes>(() => readVotes());

  const vote = (id: string) => setVotes((prev) => toggleVote(prev, id));

  const filtered = useMemo(
    () => filterItems(items, { track, query }),
    [items, track, query],
  );
  const shown = useMemo(
    () => (status ? filtered.filter((i) => i.status === status) : filtered),
    [filtered, status],
  );

  const columns = status ? [status] : STATUS_ORDER;
  const groups = useMemo(() => groupByStatus(filtered), [filtered]);
  const quarters = useMemo(() => byQuarter(shown), [shown]);
  const dirty = Boolean(status) || track !== "all" || query.trim() !== "";

  return (
    <section id="roadmap" className="border-t border-border bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Роадмап</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              {noOrphans(
                "Кварталы — ориентир, а не обещание: порядок внутри стадии задают голоса. Голос сохраняется в этом браузере.",
              )}
            </p>
          </div>
          <Segmented
            value={view}
            options={VIEWS}
            onChange={setView}
            ariaLabel="Вид роадмапа"
          />
        </header>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <label className="relative flex h-9 min-w-[12rem] flex-1 items-center sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по роадмапу"
              className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>

          <div className="flex flex-wrap items-center gap-1.5">
            {TRACKS.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={track === t}
                onClick={() => setTrack(t)}
                className={cn(
                  "h-8 rounded-md border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  track === t
                    ? "border-foreground/20 bg-background text-foreground shadow-sm"
                    : "border-transparent bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {t === "all" ? "Все направления" : TRACK_LABELS[t]}
              </button>
            ))}
          </div>

          {dirty && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-muted-foreground"
              onClick={() => {
                onStatusChange(null);
                setTrack("all");
                setQuery("");
              }}
            >
              <X />
              Сбросить
            </Button>
          )}
        </div>

        {status && (
          <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            Показана одна стадия:
            <Badge className={STATUS_STYLE[status].chip}>{STATUS_LABELS[status]}</Badge>
          </p>
        )}

        {shown.length === 0 ? (
          <p className="mt-10 rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
            Ничего не нашлось. Попробуйте другое слово или сбросьте фильтры.
          </p>
        ) : view === "board" ? (
          <div
            className={cn(
              "mt-8 grid gap-4",
              status ? "sm:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-2 xl:grid-cols-4",
            )}
          >
            {status
              ? groups[status].map((item) => (
                  <RoadmapCard
                    key={item.id}
                    item={item}
                    voted={Boolean(votes[item.id])}
                    onVote={vote}
                  />
                ))
              : columns.map((col) => (
                  <Column
                    key={col}
                    status={col}
                    items={groups[col]}
                    votes={votes}
                    onVote={vote}
                  />
                ))}
          </div>
        ) : (
          <div className="mt-8 space-y-8">
            {quarters.map((row) => (
              <div key={row.quarter} className="grid gap-4 md:grid-cols-[10rem_1fr]">
                <div className="md:sticky md:top-20 md:self-start md:pt-1">
                  <h3 className="font-medium tracking-tight">{formatQuarter(row.quarter)}</h3>
                  <p className="text-xs text-muted-foreground">
                    {row.items.length} {plural(row.items.length, ["задача", "задачи", "задач"])}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {row.items.map((item) => (
                    <RoadmapCard
                      key={item.id}
                      item={item}
                      voted={Boolean(votes[item.id])}
                      onVote={vote}
                      showStatus
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/** Колонка борда: шапка со стадией и карточки под ней. */
function Column({
  status,
  items,
  votes,
  onVote,
}: {
  status: Status;
  items: RoadmapItem[];
  votes: Votes;
  onVote: (id: string) => void;
}) {
  const Icon = STATUS_ICONS[status];
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-border bg-background/60 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium">
            <Icon className={cn("size-4", STATUS_STYLE[status].text)} />
            {STATUS_LABELS[status]}
          </span>
          <span className="text-xs tabular-nums text-muted-foreground">{items.length}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{STATUS_HINTS[status]}</p>
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          Пусто
        </p>
      ) : (
        items.map((item) => (
          <RoadmapCard
            key={item.id}
            item={item}
            voted={Boolean(votes[item.id])}
            onVote={onVote}
          />
        ))
      )}
    </div>
  );
}
