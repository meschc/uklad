import { useState } from "react";
import { FlaskConical, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { c, useT } from "../lib/copy";

const T = {
  title: c("Спросить склад", "Ask the warehouse"),
  subject: c("тема", "subject"),
  sent: c("так это увидит склад", "this is what the warehouse sees"),
  answers: c("обычно отвечает за {h} ч", "usually answers within {h} h"),
  demo: c(
    "Демонстрация. Отсюда сообщение не уходит: переписка со складом идёт в кабинете, после входа. Спросить прямо сейчас можно заявкой.",
    "A demo. Nothing is sent from here: you talk to the warehouse inside the cabinet, after signing in. To ask right now, use the request form.",
  ),
  placeholder: c(
    "Вопрос по позиции, статусу или условиям",
    "A question about an item, a status or the terms",
  ),
  aria: c("Сообщение складу {to}, тема: {subject}", "Message to {to}, subject: {subject}"),
  send: c("Отправить", "Send"),
};

export interface ChatPanelProps {
  /** Кому пишем — название склада. */
  to: string;
  /**
   * О чём разговор: позиция, поставка, статус. Тема идёт вместе с сообщением,
   * поэтому на складе не нужно выяснять, «а по какому это товару».
   */
  subject: string;
  /** Среднее время ответа склада, часов. */
  responseHours?: number;
  /** Подсказки: с чего чаще всего начинают разговор в этом месте. */
  presets?: string[];
  className?: string;
}

/**
 * Чат с кладовщиком.
 *
 * Не отдельный раздел «Сообщения», а панель, которая стоит там, где возник
 * вопрос: у позиции, у поставки, у статуса приёмки. Это и есть смысл — в
 * переписке по фулфилменту девять сообщений из десяти начинаются с
 * «здравствуйте, а по какому товару вы спрашиваете». Тема подставляется сама,
 * потому что страница знает, о чём она.
 *
 * Ответ склада сюда не подставляется. Придуманная реплика «Здравствуйте!
 * Уточним и вернёмся» выглядела бы убедительнее и была бы враньём — на том
 * конце живой кладовщик, а не бот.
 *
 * И сообщение отсюда никуда не уходит — об этом сказано в самой панели, до
 * поля ввода. Переписка со складом живёт в кабинете и требует входа: канала
 * «написать складу с сайта анонимно» нет и не планируется, потому что складу
 * нечего ответить тому, о ком он ничего не знает. Кому написать прямо сейчас —
 * заявка (`lib/leads.ts`), у неё есть и поля, и согласие, и приёмник.
 *
 * Тема (`subject`) — это и есть контекст с витрины: страница знает, о чём она,
 * и подставляет его сама. Когда чат заработает по-настоящему, тема становится
 * первой строкой переписки — менять здесь придётся отправку, а не то, что
 * панель знает о разговоре.
 */
export function ChatPanel({ to, subject, responseHours, presets = [], className }: ChatPanelProps) {
  const t = useT();
  const [text, setText] = useState("");
  const [sent, setSent] = useState<string[]>([]);

  const send = () => {
    const message = text.trim();
    if (!message) return;
    setSent((prev) => [...prev, message]);
    setText("");
  };

  return (
    <div className={cn("r-window border border-border bg-card", className)}>
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-medium">{t(T.title)}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {to} · {t(T.subject)}: {subject}
        </p>
      </div>

      {/* Пометка стоит до поля ввода, а не под ним: сказать «это макет» после
          того, как человек написал вопрос и нажал «отправить», — то же самое,
          что не сказать вовсе. На карточке склада панель стоит прямо под
          настоящей формой заявки, и без этой строки две одинаковые с виду
          формы означали бы разное, ничем это не показывая. */}
      <p className="flex items-start gap-2 border-b border-border bg-muted/40 px-4 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
        <FlaskConical className="mt-px size-3.5 shrink-0" />
        <span>{t(T.demo)}</span>
      </p>

      <div className="space-y-2 p-4">
        {sent.map((message, i) => (
          <div key={i} className="flex flex-col items-end gap-1">
            <p className="r-inset max-w-[85%] bg-primary/[0.08] px-3.5 py-2 text-[13px] leading-relaxed">
              {message}
            </p>
            <span className="text-[10px] text-muted-foreground">
              {t(T.sent)}
              {responseHours ? ` · ${t(T.answers, { h: responseHours })}` : ""}
            </span>
          </div>
        ))}

        {sent.length === 0 && presets.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pb-1">
            {presets.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setText(p)}
                className="rounded-full border border-border px-3 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                {p}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Enter отправляет, Shift+Enter переносит строку — так же, как в
              // любом мессенджере, откуда человек сюда пришёл.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder={t(T.placeholder)}
            aria-label={t(T.aria, { to, subject })}
            className="r-inset min-h-[52px] flex-1 resize-none border border-input bg-background px-3 py-2 text-[13px] outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
          />
          <button
            type="button"
            onClick={send}
            disabled={!text.trim()}
            aria-label={t(T.send)}
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors enabled:hover:bg-primary/90 disabled:opacity-40"
          >
            <Send className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
