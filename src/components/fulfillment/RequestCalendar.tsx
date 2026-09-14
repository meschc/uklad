import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requestsByDay } from "@/lib/fulfillment";
import type { FulfillmentRequest } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { cn, nowMs } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { eyebrow } from "@/components/ui/eyebrow";

/**
 * Календарь заявок (п.10.4). Тот же источник данных, что у списка
 * (`FulfillmentRequest[]`), другое представление — не новая модель.
 *
 * Отвечает на вопрос, на который список отвечает плохо: «что горит на этой
 * неделе». Заявки без даты машины сюда не попадают — их место в списке, и
 * прятать их в календаре «на сегодня» было бы враньём.
 */

const DAY_MS = 86_400_000;

/** Понедельник недели, в которую попадает дата. */
function weekStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const shift = (d.getDay() + 6) % 7; // 0 = понедельник
  return d.getTime() - shift * DAY_MS;
}

function monthStart(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

function addMonths(ts: number, n: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth() + n, 1).getTime();
}

function dayStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function RequestCalendar({
  requests,
  onPickDay,
  selectedDay,
}: {
  requests: FulfillmentRequest[];
  onPickDay: (ts: number | null) => void;
  selectedDay: number | null;
}) {
  const t = useT();
  const days = useMemo(() => requestsByDay(requests), [requests]);
  const byTs = useMemo(() => new Map(days.map((d) => [d.ts, d])), [days]);

  // Стартуем с месяца ближайшей отгрузки, а не «всегда сегодня»: чаще всего
  // смотреть надо именно туда, где что-то есть.
  const [month, setMonth] = useState(() => {
    const upcoming = days.find((d) => d.ts >= dayStart(nowMs())) ?? days[0];
    return monthStart(upcoming?.ts ?? nowMs());
  });

  const first = weekStart(month);
  const end = addMonths(month, 1);
  const cells: number[] = [];
  for (let ts = first; ts < end || cells.length % 7 !== 0; ts += DAY_MS) {
    cells.push(ts);
    if (cells.length > 42) break;
  }

  // Сегодняшний день снимаем один раз при открытии, а не в каждом рендере:
  // рендер обязан быть чистым. Календарь не живёт до следующей полуночи —
  // экран успевают закрыть, — а перерисовка от смены месяца дату не двигает.
  const [today] = useState(() => dayStart(nowMs()));
  const monthLabel = new Date(month).toLocaleDateString(t.lang, {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t("cal.prev")}
          onClick={() => setMonth(addMonths(month, -1))}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-xs font-semibold capitalize">{monthLabel}</span>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t("cal.next")}
          onClick={() => setMonth(addMonths(month, 1))}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div
        className={eyebrow({
          size: "xs",
          weight: "normal",
          className: "grid grid-cols-7 gap-1 text-center",
        })}
      >
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <span key={i}>
            {new Date(first + i * DAY_MS).toLocaleDateString(t.lang, {
              weekday: "short",
            })}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((ts) => {
          const day = byTs.get(ts);
          const outside = ts < month || ts >= end;
          const overdue = day && !day.done && ts < today;
          const selected = selectedDay === ts;
          return (
            <button
              key={ts}
              onClick={() => onPickDay(selected ? null : day ? ts : null)}
              disabled={!day}
              className={cn(
                "flex min-h-[3.25rem] flex-col items-start gap-0.5 rounded-lg border p-1.5 text-left transition-colors",
                outside ? "opacity-40" : "",
                selected
                  ? "border-primary bg-primary/10"
                  : day
                    ? "border-border bg-card hover:border-primary/40 hover:bg-accent/40"
                    : "border-transparent",
                ts === today && !selected && "ring-1 ring-primary/40",
              )}
            >
              <span className="text-[11px] font-medium tabular-nums">{new Date(ts).getDate()}</span>
              {day && (
                <span
                  className={cn(
                    "w-full truncate rounded px-1 py-0.5 text-[9px] font-semibold",
                    day.done
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                      : overdue
                        ? "bg-destructive/15 text-destructive"
                        : "bg-primary/10 text-primary",
                  )}
                >
                  {t("cal.day", { n: day.items.length, qty: day.qty })}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground">{t("cal.hint")}</p>
    </div>
  );
}
