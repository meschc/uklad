import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { POPOVER_PANEL, popoverStyle, useAnchoredPopover, type PopoverPlace } from "./popover";
import { fromIso, toIso, type DateRange, type IsoDate } from "./dates";

/**
 * Выбор даты и периода в стиле ДС (Кирилл 13 ноя: «в таких штуках нужен
 * компонент календаря, с выбором дат в стиле нашей ДС»). Системный
 * `<input type="date">` в каждом браузере свой: в Safari — колёса, в Chrome —
 * серый календарь с американской неделей.
 *
 * Значение — строка `ГГГГ-ММ-ДД`, как у системного поля: формы и хранилище
 * менять не нужно. Неделя с понедельника, названия месяцев — из `Intl` на
 * языке кабинета. Сегодня обведено, выбранное — залито синим, период —
 * светлой полосой между краями.
 */

/** «12 нояб. 2026» на языке кабинета. */
function formatDay(s: IsoDate, lang: string): string {
  const d = fromIso(s);
  return d
    ? d.toLocaleDateString(lang === "en" ? "en-GB" : "ru-RU", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";
}

function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const shift = (first.getDay() + 6) % 7; // неделя с понедельника
  return Array.from({ length: 42 }, (_, i) => new Date(year, month, 1 - shift + i));
}

const NAV =
  "flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground";

function Calendar({
  lang,
  selected,
  range,
  min,
  max,
  onPick,
}: {
  lang: string;
  selected?: IsoDate;
  range?: Partial<DateRange>;
  min?: IsoDate;
  max?: IsoDate;
  onPick: (d: IsoDate) => void;
}) {
  const start = fromIso(selected ?? range?.from ?? "") ?? new Date();
  const [view, setView] = useState({ y: start.getFullYear(), m: start.getMonth() });
  const locale = lang === "en" ? "en-GB" : "ru-RU";
  const title = new Date(view.y, view.m, 1).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
  });
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: "short" }),
  );
  const today = toIso(new Date());
  const move = (d: number) =>
    setView((v) => {
      const n = new Date(v.y, v.m + d, 1);
      return { y: n.getFullYear(), m: n.getMonth() };
    });

  return (
    <div className="w-[17rem] p-2">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" aria-label="‹" onClick={() => move(-1)} className={NAV}>
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-sm font-semibold first-letter:uppercase">{title}</span>
        <button type="button" aria-label="›" onClick={() => move(1)} className={NAV}>
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-2xs uppercase text-muted-foreground">
        {weekdays.map((w) => (
          <span key={w} className="pb-1">
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {monthGrid(view.y, view.m).map((d) => {
          const iso = toIso(d);
          const out = d.getMonth() !== view.m;
          const off = Boolean((min && iso < min) || (max && iso > max));
          const edge = iso === selected || iso === range?.from || iso === range?.to;
          const inside = Boolean(range?.from && range.to && iso > range.from && iso < range.to);
          return (
            <button
              key={iso}
              type="button"
              aria-pressed={edge}
              aria-label={iso}
              disabled={off}
              onClick={() => onPick(iso)}
              className={cn(
                "h-8 cursor-pointer rounded-md text-sm tabular-nums transition-colors duration-fast",
                out && "text-muted-foreground/60",
                inside && "rounded-none bg-primary/10",
                edge ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-accent",
                iso === today && !edge && "ring-1 ring-inset ring-primary/50",
                off && "cursor-not-allowed opacity-40 hover:bg-transparent",
              )}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const TRIGGER =
  "flex h-9 min-w-0 cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-2.5 text-left text-sm shadow-sm transition-colors duration-fast hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function usePicker() {
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const pop = useAnchoredPopover(trigger, panel, 340);
  return { ...pop, trigger, panel };
}

function Panel({
  place,
  panelRef,
  label,
  children,
}: {
  place: PopoverPlace | undefined;
  panelRef: React.RefObject<HTMLDivElement>;
  label?: string;
  children: React.ReactNode;
}) {
  if (!place) return null;
  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={label}
      style={popoverStyle(place, false)}
      className={cn(POPOVER_PANEL, place.up ? "origin-bottom" : "origin-top")}
    >
      {children}
    </div>,
    document.body,
  );
}

/** Одна дата. Пустое значение — «не выбрано», крестиком можно очистить. */
export function DatePicker({
  value,
  onChange,
  lang,
  placeholder,
  min,
  max,
  className,
  "aria-label": ariaLabel,
}: {
  value: IsoDate;
  onChange: (v: IsoDate) => void;
  lang: string;
  placeholder?: string;
  min?: IsoDate;
  max?: IsoDate;
  className?: string;
  "aria-label"?: string;
}) {
  const { open, toggle, close, trigger, panel, place } = usePicker();
  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => toggle()}
        className={cn(TRIGGER, open && "border-primary", className)}
      >
        <CalendarDays aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <span className={cn("min-w-0 flex-1 truncate", !value && "text-muted-foreground")}>
          {value ? formatDay(value, lang) : (placeholder ?? "—")}
        </span>
        {value && (
          <X
            aria-hidden
            className="size-3.5 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
          />
        )}
      </button>
      <Panel place={place} panelRef={panel} label={ariaLabel}>
        <Calendar
          lang={lang}
          selected={value}
          min={min}
          max={max}
          onPick={(d) => {
            onChange(d);
            close();
          }}
        />
      </Panel>
    </>
  );
}

/**
 * Период: первый щелчок — начало, второй — конец (раньше начала — меняются
 * местами). Меню закрывается, когда выбраны оба края.
 */
export function DateRangePicker({
  value,
  onChange,
  lang,
  placeholder,
  max,
  active,
  className,
  "aria-label": ariaLabel,
}: {
  value: DateRange | undefined;
  onChange: (v: DateRange) => void;
  lang: string;
  placeholder: string;
  max?: IsoDate;
  /** Период сейчас действует — кнопка выделена, как выбранный сегмент. */
  active?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const { open, toggle, close, trigger, panel, place } = usePicker();
  const [draft, setDraft] = useState<Partial<DateRange>>();
  const pick = (d: IsoDate) => {
    if (!draft?.from) return setDraft({ from: d });
    const [from, to] = d < draft.from ? [d, draft.from] : [draft.from, d];
    setDraft(undefined);
    onChange({ from, to });
    close();
  };
  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => {
          setDraft(undefined);
          toggle();
        }}
        className={cn(TRIGGER, (open || active) && "border-primary text-primary", className)}
      >
        <CalendarDays aria-hidden className="size-4 shrink-0" />
        <span className="truncate">
          {value && active
            ? `${formatDay(value.from, lang)} — ${formatDay(value.to, lang)}`
            : placeholder}
        </span>
      </button>
      <Panel place={place} panelRef={panel} label={ariaLabel}>
        <Calendar lang={lang} range={draft ?? value} max={max} onPick={pick} />
      </Panel>
    </>
  );
}
