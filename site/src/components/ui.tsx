import { CircleCheck, CircleDashed, CalendarClock, Hammer, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Status } from "@/data/types";

/**
 * Примитивы витрины: кнопка, сегменты, значок, полоса прогресса.
 *
 * Собраны в одном файле и намеренно проще, чем `src/components/ui/*` в
 * редакторе: там за примитивами стоят Radix и cva, потому что у редактора
 * десятки состояний и клавиатурная работа. Витрине нужны четыре статичных
 * элемента, и тащить ради них весь набор зависимостей — дороже, чем сорок
 * строк здесь. Общее у них главное: высоты контролов те же 32/36/40 px и та
 * же шкала скруглений.
 */

const BUTTON_VARIANTS = {
  default: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
  outline: "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
  ghost: "hover:bg-accent hover:text-accent-foreground",
} as const;

const BUTTON_SIZES = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
  lg: "h-10 px-6 text-sm",
  icon: "h-9 w-9",
} as const;

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
};

export function Button({ className, variant = "default", size = "md", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    />
  );
}

type LinkButtonProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
};

/** Та же кнопка ссылкой: на витрине половина действий — это переход. */
export function LinkButton({ className, variant = "default", size = "md", ...props }: LinkButtonProps) {
  return (
    <a
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background [&_svg]:size-4 [&_svg]:shrink-0",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    />
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

/** Единственный вид «кнопок-табов» — то же правило, что в редакторе. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
}: {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("inline-flex h-9 shrink-0 items-center gap-0.5 rounded-lg bg-muted p-0.5", className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex h-full items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Цвета стадий живут в css-переменных `--st-*` (см. index.css). */
export const STATUS_STYLE: Record<Status, { dot: string; chip: string; bar: string; text: string }> = {
  idea: {
    dot: "bg-[hsl(var(--st-idea))]",
    chip: "bg-[hsl(var(--st-idea-soft))] text-[hsl(var(--st-idea))]",
    bar: "bg-[hsl(var(--st-idea))]",
    text: "text-[hsl(var(--st-idea))]",
  },
  planned: {
    dot: "bg-[hsl(var(--st-planned))]",
    chip: "bg-[hsl(var(--st-planned-soft))] text-[hsl(var(--st-planned))]",
    bar: "bg-[hsl(var(--st-planned))]",
    text: "text-[hsl(var(--st-planned))]",
  },
  progress: {
    dot: "bg-[hsl(var(--st-progress))]",
    chip: "bg-[hsl(var(--st-progress-soft))] text-[hsl(var(--st-progress))]",
    bar: "bg-[hsl(var(--st-progress))]",
    text: "text-[hsl(var(--st-progress))]",
  },
  done: {
    dot: "bg-[hsl(var(--st-done))]",
    chip: "bg-[hsl(var(--st-done-soft))] text-[hsl(var(--st-done))]",
    bar: "bg-[hsl(var(--st-done))]",
    text: "text-[hsl(var(--st-done))]",
  },
};

/**
 * У стадии всегда есть знак, а не только цвет: цветовая слепота, печать и
 * режим высокой контрастности съедают цвет первым, и колонки должны
 * различаться без него.
 */
export const STATUS_ICONS: Record<Status, LucideIcon> = {
  idea: CircleDashed,
  planned: CalendarClock,
  progress: Hammer,
  done: CircleCheck,
};

/** Значок: направление, квартал, версия. Нейтральный по умолчанию. */
export function Badge({
  children,
  className,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground [&_svg]:size-3",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Полоса с двумя делениями: сделанное и начатое. Сегменты разделены зазором в
 * цвет подложки — иначе на стыке двух заливок читается третий цвет, которого
 * в легенде нет.
 */
export function SplitProgress({
  done,
  inProgress,
  className,
}: {
  done: number;
  inProgress: number;
  className?: string;
}) {
  const a = Math.max(0, Math.min(100, Math.round(done)));
  const b = Math.max(0, Math.min(100 - a, Math.round(inProgress)));
  return (
    <div
      role="progressbar"
      aria-valuenow={a}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted", className)}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", STATUS_STYLE.done.bar)}
        style={{ width: `${a}%` }}
      />
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500",
          STATUS_STYLE.progress.bar,
        )}
        style={{ width: `${b}%` }}
      />
    </div>
  );
}

/** Полоса готовности. Значение подписано рядом — цвет один не считается. */
export function Progress({
  percent,
  className,
  barClassName,
}: {
  percent: number;
  className?: string;
  barClassName?: string;
}) {
  const safe = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div
      role="progressbar"
      aria-valuenow={safe}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <div
        className={cn("h-full rounded-full bg-primary transition-[width] duration-500", barClassName)}
        style={{ width: `${safe}%` }}
      />
    </div>
  );
}
