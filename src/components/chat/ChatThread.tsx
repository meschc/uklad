import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ChevronDown,
  ChevronUp,
  Loader2,
  Pencil,
  Reply,
  Search,
  SendHorizontal,
  X,
} from "lucide-react";
import type { ChatMessage, Partner, UserRole } from "@/lib/types";
import { groupMessagesByDay, lastEditable, searchMessages } from "@/lib/chat";
import { chatRepository } from "@/lib/data";
import { useEditor } from "@/lib/store";
import { useCommand } from "@/lib/useCommand";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { chatInitials, formatChatDay } from "./chatFormat";
import { ChatBubble, type BubbleActions } from "./ChatBubble";
import { ChatDemoNote } from "./ChatDemoNote";

/** Высота поля ввода, растущего под текст: от одной строки до примерно шести. */
const COMPOSER_MIN = 40;
const COMPOSER_MAX = 140;

/**
 * Черновики по собеседникам. Как в Телеграме: начал писать одному, ушёл к
 * другому — недописанное ждёт на месте. Живут до перезагрузки вкладки, а не в
 * сторе: черновик — не доменные данные, и на сервер он не поедет.
 */
const drafts = new Map<string, string>();

/** Над чем сейчас поле ввода: обычная отправка, ответ или правка. */
type Mode =
  { kind: "send" } | { kind: "reply"; target: ChatMessage } | { kind: "edit"; target: ChatMessage };

/**
 * Лента переписки с одним собеседником и поле ввода.
 *
 * Входящие помечаются прочитанными при открытии треда, а не по факту прокрутки
 * до низа: в переписке на десяток реплик «докрутил ли он» — гадание, а счётчик,
 * который не гаснет после того, как человек открыл и прочитал чат, раздражает
 * сильнее, чем неточность.
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
  const showToast = useEditor((s) => s.showToast);
  const [draft, setDraftState] = useState(() => drafts.get(partner.id) ?? "");
  const [mode, setMode] = useState<Mode>({ kind: "send" });
  const [atBottom, setAtBottom] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hit, setHit] = useState(0);
  const feedRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const setDraft = (v: string) => {
    setDraftState(v);
    if (v) drafts.set(partner.id, v);
    else drafts.delete(partner.id);
  };

  // Смена собеседника пересоздаёт ленту целиком (`key` в `ChatScreen`), так
  // что черновик, режим и поиск подхватываются заново сами.

  // Отправка идёт через репозиторий (п.3.2.1): здесь появится запрос к серверу.
  const send = useCommand((text: string, replyTo?: string) =>
    chatRepository.send(partner.id, text, replyTo),
  );
  const edit = useCommand((id: string, text: string) => chatRepository.edit(partner.id, id, text));
  const busy = send.pending || edit.pending;
  const error = send.error ?? edit.error;

  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const hits = useMemo(() => searchMessages(messages, query), [messages, query]);

  // Лента открывается на последнем сообщении и остаётся внизу при отправке:
  // читают чат всегда с конца. Layout-эффект, а не обычный, — иначе видно, как
  // лента прыгает от начала к концу. Если человек отмотал историю вверх, новое
  // входящее его не сдёргивает — для этого есть кнопка «вниз».
  useLayoutEffect(() => {
    const feed = feedRef.current;
    if (feed && atBottom) feed.scrollTop = feed.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, partner.id]);

  // Пришедшее, пока тред открыт, гасим сразу — человек это уже видит.
  //
  // Единственная команда без «идёт» и «не вышло»: отметку о прочтении человек
  // не запрашивал, повторять её нечем и незачем. Провал уже записан в консоль
  // самим `attempt()`, а сообщение «не удалось отметить прочитанным» посреди
  // чтения — шум, на который нельзя ответить ничем полезным.
  useEffect(() => {
    void chatRepository.markRead(partner.id);
  }, [partner.id, messages.length]);

  const jumpTo = (id: string) => {
    document.getElementById(`msg-${id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    setFlash(id);
    window.setTimeout(() => setFlash((f) => (f === id ? null : f)), 1200);
  };

  // Перейти к совпадению номер i: прокрутка — в обработчике, а не эффектом,
  // чтобы лента не дёргалась на каждый перерендер.
  const goHit = (i: number, list = hits) => {
    if (!list.length) return;
    const n = (i + list.length) % list.length;
    setHit(n);
    jumpTo(list[n]);
  };

  const toBottom = () => {
    const feed = feedRef.current;
    if (feed) feed.scrollTo({ top: feed.scrollHeight, behavior: "smooth" });
  };

  const grow = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, COMPOSER_MIN), COMPOSER_MAX)}px`;
  };

  const focusInput = () => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    requestAnimationFrame(() => grow(el));
  };

  const cancelMode = () => {
    if (mode.kind === "edit") setDraftState(drafts.get(partner.id) ?? "");
    setMode({ kind: "send" });
  };

  const actions: BubbleActions = {
    onReply: (m) => {
      setMode({ kind: "reply", target: m });
      focusInput();
    },
    onEdit: (m) => {
      setMode({ kind: "edit", target: m });
      // Правка подставляет текст поверх черновика, а черновик не трогает: после
      // «Отменить» недописанное вернётся.
      setDraftState(m.text);
      focusInput();
    },
    onCopy: (m) => {
      void navigator.clipboard?.writeText(m.text).then(() => showToast("chat.copied"));
    },
    onDelete: (m) => {
      void chatRepository.remove(partner.id, m.id);
      if (mode.kind !== "send" && mode.target.id === m.id) cancelMode();
    },
    onJump: jumpTo,
  };

  // При отказе поле НЕ очищается: набранное — единственная копия сообщения, и
  // потерять её значит заставить человека печатать заново. Кнопка становится
  // повтором, текст остаётся на месте.
  const submit = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    if (mode.kind === "edit") {
      const res = await edit.run(mode.target.id, text);
      if (!res.ok) return;
      setDraftState(drafts.get(partner.id) ?? "");
    } else {
      const res = await send.run(text, mode.kind === "reply" ? mode.target.id : undefined);
      if (!res.ok) return;
      setDraft("");
      setAtBottom(true);
    }
    setMode({ kind: "send" });
    const el = inputRef.current;
    if (el) {
      el.style.height = `${COMPOSER_MIN}px`;
      el.focus();
    }
  };

  const days = groupMessagesByDay(messages);

  return (
    <section className="relative flex min-w-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
        <span className="flex size-9 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
          {chatInitials(partner.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold tracking-tight">{partner.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {partner.contact || t("chat.subtitle")}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t("chat.search")}
          title={t("chat.search")}
          onClick={() => {
            setSearchOpen((v) => !v);
            requestAnimationFrame(() => searchRef.current?.focus());
          }}
        >
          <Search className="size-4" />
        </Button>
      </header>

      {searchOpen && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-5 py-2">
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              goHit(0, searchMessages(messages, e.target.value));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") goHit(hit + 1);
              if (e.key === "Escape") setSearchOpen(false);
            }}
            placeholder={t("chat.searchIn")}
            aria-label={t("chat.searchIn")}
            className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {query.trim() &&
              (hits.length
                ? t("chat.searchCount", { i: Math.min(hit, hits.length - 1) + 1, n: hits.length })
                : t("chat.searchNone"))}
          </span>
          <Button
            variant="ghost"
            size="sm"
            aria-label={t("chat.prevHit")}
            disabled={hits.length < 2}
            onClick={() => goHit(hit + 1)}
          >
            <ChevronUp className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={t("chat.nextHit")}
            disabled={hits.length < 2}
            onClick={() => goHit(hit - 1)}
          >
            <ChevronDown className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={t("chat.closeSearch")}
            onClick={() => setSearchOpen(false)}
          >
            <X className="size-4" />
          </Button>
        </div>
      )}

      <ChatDemoNote />

      <div
        ref={feedRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
        }}
        className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
      >
        {days.length === 0 ? (
          <p className="py-10 text-center text-xs text-muted-foreground">{t("chat.emptyThread")}</p>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-4">
            {days.map((day) => (
              <div key={day.at} className="flex flex-col gap-1">
                <div className="sticky top-0 z-10 flex justify-center py-1">
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-2xs font-medium text-muted-foreground">
                    {formatChatDay(day.at, t)}
                  </span>
                </div>
                {day.messages.map((m, i) => (
                  <ChatBubble
                    key={m.id}
                    message={m}
                    quoted={m.replyTo ? (byId.get(m.replyTo) ?? null) : null}
                    own={m.from === role}
                    tail={day.messages[i + 1]?.from !== m.from}
                    highlight={flash === m.id}
                    t={t}
                    actions={actions}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {!atBottom && (
        <button
          type="button"
          onClick={toBottom}
          aria-label={t("chat.toBottom")}
          title={t("chat.toBottom")}
          className="absolute bottom-28 right-6 flex size-10 cursor-pointer items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-md hover:text-foreground"
        >
          <ArrowDown className="size-4" />
        </button>
      )}

      <footer className="shrink-0 border-t border-border px-5 py-3">
        {mode.kind !== "send" && (
          <div className="mx-auto mb-2 flex max-w-2xl items-center gap-2 border-l-2 border-primary pl-2.5">
            {mode.kind === "reply" ? (
              <Reply className="size-4 shrink-0 text-primary" />
            ) : (
              <Pencil className="size-4 shrink-0 text-primary" />
            )}
            <button
              type="button"
              onClick={() => jumpTo(mode.target.id)}
              className="min-w-0 flex-1 cursor-pointer text-left"
            >
              <span className="block text-xs font-medium text-primary">
                {mode.kind === "reply" ? t("chat.replyingTo") : t("chat.editing")}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {mode.target.text}
              </span>
            </button>
            <Button variant="ghost" size="sm" aria-label={t("chat.cancel")} onClick={cancelMode}>
              <X className="size-4" />
            </Button>
          </div>
        )}
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <textarea
            ref={inputRef}
            value={draft}
            rows={1}
            onChange={(e) => {
              if (mode.kind === "edit") setDraftState(e.target.value);
              else setDraft(e.target.value);
              grow(e.target);
            }}
            onKeyDown={(e) => {
              // Enter отправляет, Shift+Enter переносит строку — привычка любого
              // мессенджера. Кнопка рядом остаётся: без неё на тач-клавиатуре
              // отправить нечем.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              } else if (e.key === "Escape" && mode.kind !== "send") {
                e.preventDefault();
                cancelMode();
              } else if (e.key === "ArrowUp" && !draft && mode.kind === "send") {
                // Стрелка вверх в пустом поле — поправить своё последнее, как в
                // Телеграме: опечатку замечают сразу после отправки.
                const last = lastEditable(messages, role);
                if (last) {
                  e.preventDefault();
                  actions.onEdit(last);
                }
              }
            }}
            placeholder={t("chat.composerPlaceholder")}
            aria-label={t("chat.composerPlaceholder")}
            className="min-h-10 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button
            size="sm"
            className="h-10"
            onClick={() => void submit()}
            disabled={!draft.trim() || busy}
          >
            {busy ? <Loader2 className="animate-spin" /> : <SendHorizontal className="size-3.5" />}
            {error ? t("data.retry") : mode.kind === "edit" ? t("chat.save") : t("chat.send")}
          </Button>
        </div>
        {/* Подсказка и отказ занимают одну строку: иначе поле ввода прыгало бы
            вверх на каждой неудачной отправке. */}
        <p
          className={cn(
            "mx-auto mt-1.5 max-w-2xl text-2xs",
            error ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {error ? t(error) : t("chat.sendHint")}
        </p>
      </footer>
    </section>
  );
}
