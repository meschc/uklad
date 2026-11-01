import { Check, CheckCheck, Copy, Pencil, Reply, Trash2 } from "lucide-react";
import type { ChatMessage } from "@/lib/types";
import type { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { formatChatTime } from "./chatFormat";

type T = ReturnType<typeof useT>;

/** Что можно сделать с репликой из её меню. */
export interface BubbleActions {
  onReply: (m: ChatMessage) => void;
  onEdit: (m: ChatMessage) => void;
  onCopy: (m: ChatMessage) => void;
  onDelete: (m: ChatMessage) => void;
  /** Клик по цитате — прокрутить к оригиналу. */
  onJump: (id: string) => void;
}

/**
 * Реплика. Свои — справа и цветом, чужие — слева: сторона в переписке читается
 * быстрее подписи, поэтому имени отправителя над сообщением нет.
 *
 * Повадки взяты у Телеграма, потому что ими уже умеют пользоваться: двойной
 * клик — ответить, меню при наведении, цитата над ответом ведёт к оригиналу,
 * «изменено» рядом со временем. Хвостик у пузыря только у последней реплики
 * подряд от одной стороны — так серия читается одним высказыванием.
 */
export function ChatBubble({
  message,
  quoted,
  own,
  tail,
  highlight,
  t,
  actions,
}: {
  message: ChatMessage;
  /** Сообщение, на которое это — ответ (если оно ещё в ленте). */
  quoted: ChatMessage | null;
  own: boolean;
  tail: boolean;
  highlight: boolean;
  t: T;
  actions: BubbleActions;
}) {
  const deleted = Boolean(message.deletedAt);
  return (
    <div
      id={`msg-${message.id}`}
      className={cn("group flex items-center gap-1", own ? "flex-row-reverse" : "flex-row")}
    >
      <div
        onDoubleClick={() => !deleted && actions.onReply(message)}
        className={cn(
          "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-snug transition-shadow",
          own ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
          tail && (own ? "rounded-br-md" : "rounded-bl-md"),
          highlight && "ring-2 ring-ring ring-offset-2 ring-offset-background",
        )}
      >
        {message.replyTo && (
          <button
            type="button"
            onClick={() => message.replyTo && actions.onJump(message.replyTo)}
            className={cn(
              "mb-1 block w-full cursor-pointer border-l-2 pl-2 text-left text-xs",
              own
                ? "border-primary-foreground/60 text-primary-foreground/80"
                : "border-primary text-muted-foreground",
            )}
          >
            <span className="line-clamp-1">
              {quoted && !quoted.deletedAt ? quoted.text : t("chat.deleted")}
            </span>
          </button>
        )}
        {message.topic && !deleted && (
          <p className="mb-1 text-2xs font-semibold opacity-80">
            {t(`chat.topic.${message.topic.kind}`)}
            {message.topic.label ? ` · ${message.topic.label}` : ""}
          </p>
        )}
        {deleted ? (
          <p className="italic opacity-70">{t("chat.deleted")}</p>
        ) : (
          <p className="whitespace-pre-wrap break-words">{message.text}</p>
        )}
        <p
          className={cn(
            "mt-1 flex items-center justify-end gap-1 text-2xs tabular-nums",
            own ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        >
          {message.editedAt && !deleted && <span>{t("chat.edited")}</span>}
          {formatChatTime(message.at, t)}
          {own &&
            (message.readAt ? (
              <CheckCheck className="size-3" aria-label={t("chat.read")} />
            ) : (
              <Check className="size-3" aria-label={t("chat.sent")} />
            ))}
        </p>
      </div>

      {!deleted && (
        <div
          role="toolbar"
          aria-label={t("chat.actions")}
          className="flex opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100"
        >
          <IconAction label={t("chat.reply")} onClick={() => actions.onReply(message)}>
            <Reply className="size-3.5" />
          </IconAction>
          <IconAction label={t("chat.copy")} onClick={() => actions.onCopy(message)}>
            <Copy className="size-3.5" />
          </IconAction>
          {own && (
            <>
              <IconAction label={t("chat.edit")} onClick={() => actions.onEdit(message)}>
                <Pencil className="size-3.5" />
              </IconAction>
              <IconAction label={t("chat.delete")} onClick={() => actions.onDelete(message)}>
                <Trash2 className="size-3.5" />
              </IconAction>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function IconAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="flex size-7 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}
