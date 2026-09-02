import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, CheckCheck, SendHorizontal } from "lucide-react";
import type { ChatMessage, Partner, UserRole } from "@/lib/types";
import { groupMessagesByDay } from "@/lib/chat";
import { useEditor } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { chatInitials, formatChatDay, formatChatTime } from "./chatFormat";

/** Высота поля ввода, растущего под текст: от одной строки до примерно шести. */
const COMPOSER_MIN = 40;
const COMPOSER_MAX = 140;

/**
 * Лента переписки с одним собеседником и поле ввода.
 *
 * Входящие помечаются прочитанными при открытии треда (это делает `openChat`),
 * а не по факту прокрутки до низа: в переписке на десяток реплик «докрутил ли
 * он» — гадание, а счётчик, который не гаснет после того, как человек открыл и
 * прочитал чат, раздражает сильнее, чем неточность.
 */
export function ChatThread({
  partner,
  messages,
  role,
}: {
  partner: Partner;
  messages: ChatMessage[];
  role: UserRole;
}) {
  const t = useT();
  const sendChatMessage = useEditor((s) => s.sendChatMessage);
  const markChatRead = useEditor((s) => s.markChatRead);
  const [draft, setDraft] = useState("");
  const feedRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Лента открывается на последнем сообщении и остаётся внизу при отправке:
  // читают чат всегда с конца. Layout-эффект, а не обычный, — иначе видно, как
  // лента прыгает от начала к концу.
  useLayoutEffect(() => {
    const feed = feedRef.current;
    if (feed) feed.scrollTop = feed.scrollHeight;
  }, [messages.length, partner.id]);

  // Пришедшее, пока тред открыт, гасим сразу — человек это уже видит.
  useEffect(() => {
    markChatRead(partner.id);
  }, [markChatRead, partner.id, messages.length]);

  const grow = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, COMPOSER_MIN), COMPOSER_MAX)}px`;
  };

  const send = () => {
    if (!draft.trim()) return;
    sendChatMessage(partner.id, draft);
    setDraft("");
    const el = inputRef.current;
    if (el) {
      el.style.height = `${COMPOSER_MIN}px`;
      el.focus();
    }
  };

  const days = groupMessagesByDay(messages);

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
        <span className="flex size-9 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
          {chatInitials(partner.name)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight">{partner.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {partner.contact || t("chat.subtitle")}
          </p>
        </div>
      </header>

      <div ref={feedRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {days.length === 0 ? (
          <p className="py-10 text-center text-xs text-muted-foreground">
            {t("chat.emptyThread")}
          </p>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-4">
            {days.map((day) => (
              <div key={day.at} className="flex flex-col gap-1.5">
                <div className="sticky top-0 z-10 flex justify-center py-1">
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {formatChatDay(day.at, t)}
                  </span>
                </div>
                {day.messages.map((m) => (
                  <Bubble key={m.id} message={m} own={m.from === role} t={t} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <footer className="shrink-0 border-t border-border px-5 py-3">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <textarea
            ref={inputRef}
            value={draft}
            rows={1}
            onChange={(e) => {
              setDraft(e.target.value);
              grow(e.target);
            }}
            onKeyDown={(e) => {
              // Enter отправляет, Shift+Enter переносит строку — привычка любого
              // мессенджера. Кнопка рядом остаётся: без неё на тач-клавиатуре
              // отправить нечем.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={t("chat.composerPlaceholder")}
            aria-label={t("chat.composerPlaceholder")}
            className="min-h-10 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button size="sm" className="h-10" onClick={send} disabled={!draft.trim()}>
            <SendHorizontal className="size-3.5" />
            {t("chat.send")}
          </Button>
        </div>
        <p className="mx-auto mt-1.5 max-w-2xl text-[10px] text-muted-foreground">
          {t("chat.sendHint")}
        </p>
      </footer>
    </section>
  );
}

/**
 * Реплика. Свои — справа и цветом, чужие — слева: сторона в переписке читается
 * быстрее подписи, поэтому имени отправителя над сообщением нет.
 */
function Bubble({
  message,
  own,
  t,
}: {
  message: ChatMessage;
  own: boolean;
  t: ReturnType<typeof useT>;
}) {
  return (
    <div className={cn("flex", own ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-snug",
          own
            ? "rounded-br-md bg-primary text-primary-foreground"
            : "rounded-bl-md bg-muted text-foreground",
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.text}</p>
        <p
          className={cn(
            "mt-1 flex items-center justify-end gap-1 text-[10px] tabular-nums",
            own ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        >
          {formatChatTime(message.at, t)}
          {own &&
            (message.readAt ? (
              <CheckCheck className="size-3" aria-label={t("chat.read")} />
            ) : (
              <Check className="size-3" aria-label={t("chat.sent")} />
            ))}
        </p>
      </div>
    </div>
  );
}
