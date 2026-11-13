import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface JournalAction {
  key: string;
  /** Время уже по-человечески: «14:03:21». */
  time: string;
  label: ReactNode;
  /** С чем было действие: товар, тара, заказ — строкой под действием. */
  detail?: string;
  tone?: "error" | "warn";
}

/**
 * Список действий — один на всю систему: свой журнал на рабочем месте,
 * журнал сотрудника и журнал устройства рисуют действия одинаково
 * (Кирилл 13.11, «одна система, как глобальная»).
 */
export function JournalActions({ items }: { items: readonly JournalAction[] }) {
  return (
    <ol className="divide-y divide-border">
      {items.map((a) => (
        <li key={a.key} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 px-4 py-2 text-sm">
          <span className="tabular-nums text-muted-foreground">{a.time}</span>
          <span
            className={cn(
              a.tone === "error" && "text-destructive",
              a.tone === "warn" && "text-warning",
            )}
          >
            {a.label}
            {a.detail && (
              <span className="block truncate text-xs text-muted-foreground">{a.detail}</span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
