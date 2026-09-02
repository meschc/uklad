import { Search } from "lucide-react";
import type { ChatMessage, Partner, UserRole } from "@/lib/types";
import { lastMessage, unreadIn } from "@/lib/chat";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { chatInitials, formatChatStamp } from "./chatFormat";

/**
 * Колонка переписок склада. Сортировка — по последнему сообщению, а не по
 * алфавиту: список для того и нужен, чтобы свежее было сверху, а искать по
 * имени есть поиск.
 */
export function ChatThreadList({
  partners,
  chats,
  role,
  activeId,
  query,
  onQuery,
  onPick,
}: {
  partners: Partner[];
  chats: Record<string, ChatMessage[]>;
  role: UserRole;
  activeId: string | null;
  query: string;
  onQuery: (v: string) => void;
  onPick: (id: string) => void;
}) {
  const t = useT();

  const sorted = [...partners].sort((a, b) => {
    const at = lastMessage(chats[a.id] ?? [])?.at ?? 0;
    const bt = lastMessage(chats[b.id] ?? [])?.at ?? 0;
    return bt - at;
  });

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-card">
      <div className="border-b border-border p-3">
        <h1 className="text-sm font-semibold tracking-tight">{t("chat.title")}</h1>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{t("chat.subtitle")}</p>
        <div className="relative mt-2.5">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={t("chat.searchPlaceholder")}
            aria-label={t("chat.searchPlaceholder")}
            className="h-9 w-full rounded-md border border-input bg-background pl-7 pr-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {sorted.length === 0 && (
          <li className="px-3 py-6 text-center text-xs text-muted-foreground">
            {t("chat.noFound")}
          </li>
        )}
        {sorted.map((p) => {
          const messages = chats[p.id] ?? [];
          const last = lastMessage(messages);
          const unread = unreadIn(messages, role);
          const active = p.id === activeId;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onPick(p.id)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                  active ? "bg-primary/10" : "hover:bg-accent",
                )}
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {chatInitials(p.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-sm",
                        unread > 0 ? "font-semibold" : "font-medium",
                      )}
                    >
                      {p.name}
                    </span>
                    {last && (
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        {formatChatStamp(last.at, t)}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2">
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-xs",
                        unread > 0 ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {last
                        ? `${last.from === role ? `${t("chat.you")}: ` : ""}${last.text}`
                        : t("chat.emptyThread")}
                    </span>
                    {unread > 0 && (
                      <span className="flex min-w-4 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold tabular-nums text-primary-foreground">
                        {unread}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
