import { useState } from "react";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";

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
 * Ответ склада сюда не подставляется. Панель показывает ровно то, что
 * произошло: сообщение ушло, и известно, за сколько склад обычно отвечает.
 * Придуманная реплика «Здравствуйте! Уточним и вернёмся» выглядела бы
 * убедительнее и была бы враньём — на том конце живой кладовщик, а не бот.
 */
export function ChatPanel({
  to,
  subject,
  responseHours,
  presets = [],
  className,
}: ChatPanelProps) {
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
        <p className="text-sm font-medium">Спросить склад</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {to} · тема: {subject}
        </p>
      </div>

      <div className="space-y-2 p-4">
        {sent.map((message, i) => (
          <div key={i} className="flex flex-col items-end gap-1">
            <p className="r-inset max-w-[85%] bg-primary/[0.08] px-3.5 py-2 text-[13px] leading-relaxed">
              {message}
            </p>
            <span className="text-[10px] text-muted-foreground">
              отправлено
              {responseHours ? ` · склад обычно отвечает за ${responseHours} ч` : ""}
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
            placeholder="Вопрос по позиции, статусу или условиям"
            aria-label={`Сообщение складу ${to}, тема: ${subject}`}
            className="r-inset min-h-[52px] flex-1 resize-none border border-input bg-background px-3 py-2 text-[13px] outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
          />
          <button
            type="button"
            onClick={send}
            disabled={!text.trim()}
            aria-label="Отправить"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors enabled:hover:bg-primary/90 disabled:opacity-40"
          >
            <Send className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
