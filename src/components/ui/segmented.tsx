import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Сегментированный переключатель — единственный вид «кнопок-табов» в проекте
 * (роль, режим просмотра, фильтр, тема, язык). До него каждый экран собирал
 * свой набор из `bg-muted p-0.5` c произвольными паддингами, и на одной полке
 * оказывались контролы разной высоты.
 *
 * Высоты совпадают с `Button`: `sm` = h-8, `md` = h-9. Тогда переключатель,
 * кнопка, поле и селект стоят в одну линию без подгонки на месте.
 *
 * Выбранный сегмент отмечает одна «плашка», которая переезжает к новому
 * значению (Кирилл 13 ноя: «почему у этого элемента во всей ДС нет плавного
 * переключения»). Плашка, а не фон у каждой кнопки: фон гаснет и загорается
 * на месте, а глаз ищет, куда ушло выделение.
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
  const wrap = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number }>();
  const index = options.findIndex((o) => o.value === value);
  // Место плашки — по кнопке выбранного сегмента. Пересчёт и при смене
  // ширины: подпись могла смениться с языком, а `grow` тянется за строкой.
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      const btn = el.children[index + 1] as HTMLElement | undefined;
      setThumb(btn?.offsetWidth ? { x: btn.offsetLeft, w: btn.offsetWidth } : undefined);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [index, options.length]);
  return (
    <div
      ref={wrap}
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "relative inline-flex shrink-0 items-center gap-0.5 rounded-lg bg-muted",
        s.wrap,
        grow && "w-full",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute bottom-0.5 left-0 top-0.5 rounded-md bg-background shadow-sm transition-[transform,width] duration-base ease-out-soft",
          !thumb && "opacity-0",
        )}
        style={thumb && { width: thumb.w, transform: `translateX(${thumb.x}px)` }}
      />
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
              "relative flex h-full items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors duration-base ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              s.item,
              s.icon,
              grow && "flex-1",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              // Пока плашка не измерена (первый кадр, тесты без раскладки) —
              // выделение фоном самой кнопки, чтобы выбор был виден всегда.
              active && !thumb && "bg-background shadow-sm",
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
