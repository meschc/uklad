import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Сворачивание секций левой панели с запоминанием в localStorage: пользователь
 * скрывает ненужные группы (этажи, объекты, шаблоны), освобождая высоту под
 * нужные. Открытые секции с `grow` делят свободное место — так их высота
 * получается разной и управляемой.
 */
export function useCollapsed(
  key: string,
  defaultCollapsed = false,
): [boolean, () => void] {
  const storeKey = `uklad-panel-${key}`;
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(storeKey);
      // Пользовательский выбор важнее умолчания; без записи берём умолчание.
      return saved == null ? defaultCollapsed : saved === "1";
    } catch {
      return defaultCollapsed;
    }
  });
  const toggle = () =>
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(storeKey, next ? "1" : "0");
      } catch {
        /* приватный режим — просто не запоминаем */
      }
      return next;
    });
  return [collapsed, toggle];
}

interface PanelSectionProps {
  storageKey: string;
  title: string;
  count?: number;
  icon?: ReactNode;
  /** Доп. контролы в шапке (напр. «+») — их клики не сворачивают секцию. */
  right?: ReactNode;
  /** Открытая секция забирает долю свободной высоты (flex-1) и скроллит тело. */
  grow?: boolean;
  bodyClassName?: string;
  /** Секция свёрнута при первом открытии (пока пользователь не решил иначе). */
  defaultCollapsed?: boolean;
  children: ReactNode;
}

export function PanelSection({
  storageKey,
  title,
  count,
  icon,
  right,
  grow,
  bodyClassName,
  defaultCollapsed,
  children,
}: PanelSectionProps) {
  const [collapsed, toggle] = useCollapsed(storageKey, defaultCollapsed);
  const open = !collapsed;
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm",
        open && grow && "min-h-0 flex-1",
      )}
    >
      <div className="flex shrink-0 items-center gap-1 px-2 py-2">
        <button
          type="button"
          onClick={toggle}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronRight
            className={cn(
              "size-3 shrink-0 transition-transform",
              open && "rotate-90",
            )}
          />
          {icon}
          <span className="truncate text-[11px] font-semibold uppercase tracking-wide">
            {title}
            {count != null && ` · ${count}`}
          </span>
        </button>
        {right}
      </div>
      {open && (
        <div
          className={cn(
            "no-scrollbar min-h-0 flex-1 overflow-y-auto",
            bodyClassName,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}
