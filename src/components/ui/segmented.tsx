import { cn } from "@/lib/utils";

/**
 * Сегментированный переключатель — единственный вид «кнопок-табов» в проекте
 * (роль, режим просмотра, фильтр, тема, язык). До него каждый экран собирал
 * свой набор из `bg-muted p-0.5` c произвольными паддингами, и на одной полке
 * оказывались контролы разной высоты.
 *
 * Высоты совпадают с `Button`: `sm` = h-8, `md` = h-9. Тогда переключатель,
 * кнопка, поле и селект стоят в одну линию без подгонки на месте.
 */

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  title?: string;
}

const SIZES = {
  sm: { wrap: "h-8 p-0.5", item: "px-2.5 text-xs", icon: "[&_svg]:size-3.5" },
  md: { wrap: "h-9 p-0.5", item: "px-3 text-sm", icon: "[&_svg]:size-4" },
} as const;

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "sm",
  grow,
  ariaLabel,
  className,
}: {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  size?: keyof typeof SIZES;
  /** Сегменты делят ширину поровну — для контрола во всю строку. */
  grow?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  const s = SIZES[size];
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-lg bg-muted",
        s.wrap,
        grow && "w-full",
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            title={o.title ?? o.label}
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex h-full items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              s.item,
              s.icon,
              grow && "flex-1",
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
