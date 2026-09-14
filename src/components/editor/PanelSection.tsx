import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { readLocal, writeLocal } from "@/lib/safeStorage";
import { cn } from "@/lib/utils";
import { eyebrow } from "@/components/ui/eyebrow";
import { card } from "@/components/ui/card";

/**
 * Сворачивание секций левой панели с запоминанием в localStorage: пользователь
 * скрывает ненужные группы (этажи, объекты, шаблоны), освобождая высоту под
 * нужные. Открытые секции с `grow` делят свободное место — так их высота
 * получается разной и управляемой.
 *
 * Хук наружу не выпущен: сворачивание — часть самой секции, и отдельно от неё
 * никому не понадобилось. Понадобится — тогда и переедет в свой файл.
 */
function useCollapsed(key: string, defaultCollapsed = false): [boolean, () => void] {
  const storeKey = `uklad-panel-${key}`;
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    const saved = readLocal(storeKey);
    // Пользовательский выбор важнее умолчания; без записи берём умолчание.
    return saved == null ? defaultCollapsed : saved === "1";
  });
  const toggle = () =>
    setCollapsed((c) => {
      const next = !c;
      writeLocal(storeKey, next ? "1" : "0");
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
        card({ pad: "none", className: "flex shrink-0 flex-col overflow-hidden shadow-sm" }),
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
            className={cn("size-3 shrink-0 transition-transform", open && "rotate-90")}
          />
          {icon}
          <span className={eyebrow({ tone: "current", className: "truncate" })}>
            {title}
            {count != null && ` · ${count}`}
          </span>
        </button>
        {right}
      </div>
      {open && (
        <div className={cn("no-scrollbar min-h-0 flex-1 overflow-y-auto", bodyClassName)}>
          {children}
        </div>
      )}
    </div>
  );
}
