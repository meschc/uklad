import * as React from "react";
import { CheckCircle2, CircleAlert, Info, TriangleAlert, Undo2, X } from "lucide-react";
import type { NoticeTone } from "@/lib/notice";
import { cn } from "@/lib/utils";

/**
 * Уведомление — внешний вид, без таймеров и стора (их держит
 * `components/Toaster`). Поверхность всегда в цвет темы (`popover`), тон
 * несёт значок: цвет плюс форма, чтобы отказ не путался с успехом и без
 * цветового зрения. Ошибка читается вслух сразу (`role="alert"`), остальное —
 * вежливо (`role="status"`).
 */
const ICON: Record<NoticeTone, { Icon: typeof Info; className: string }> = {
  success: { Icon: CheckCircle2, className: "text-success" },
  info: { Icon: Info, className: "text-primary" },
  warning: { Icon: TriangleAlert, className: "text-warning" },
  error: { Icon: CircleAlert, className: "text-destructive" },
};

export interface ToastCardProps extends React.HTMLAttributes<HTMLDivElement> {
  tone: NoticeTone;
  text: string;
  /** Счётчик повторов («×2»), если то же пришло ещё раз. */
  repeat?: { n: number; label: string };
  undo?: { label: string; onClick: () => void };
  close: { label: string; onClick: () => void };
  /** Уходит — плавно гаснет, прежде чем исчезнуть из стопки. */
  leaving?: boolean;
}

export const ToastCard = React.forwardRef<HTMLDivElement, ToastCardProps>(
  ({ tone, text, repeat, undo, close, leaving, className, ...rest }, ref) => {
    const { Icon, className: iconClass } = ICON[tone];
    return (
      <div
        ref={ref}
        role={tone === "error" ? "alert" : "status"}
        data-tone={tone}
        className={cn(
          "pointer-events-auto flex w-full items-start gap-2.5 rounded-lg border border-border bg-popover py-2.5 pl-3.5 pr-2 text-sm text-popover-foreground shadow-lg",
          "animate-scale-in transition-[opacity,transform] duration-base ease-out-soft",
          leaving && "translate-y-1 opacity-0",
          className,
        )}
        {...rest}
      >
        <Icon className={cn("mt-0.5 size-4 shrink-0", iconClass)} aria-hidden />
        <p className="min-w-0 flex-1 py-px font-medium leading-snug">
          {text}
          {repeat && repeat.n > 1 && (
            <span className="ml-1.5 font-normal tabular-nums text-muted-foreground">
              <span aria-hidden>×{repeat.n}</span>
              <span className="sr-only">{repeat.label}</span>
            </span>
          )}
        </p>
        {undo && (
          <button
            type="button"
            onClick={undo.onClick}
            className="-my-1 inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 font-semibold text-primary transition-colors duration-fast hover:bg-muted"
          >
            <Undo2 className="size-3.5" aria-hidden />
            {undo.label}
          </button>
        )}
        <button
          type="button"
          onClick={close.onClick}
          aria-label={close.label}
          className="-my-1 inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors duration-fast hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
    );
  },
);
ToastCard.displayName = "ToastCard";
