import * as React from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { eyebrow } from "./eyebrow";

/**
 * Поле формы и его ошибка — одно правило на весь Уклад (Кирилл 13 ноя: «если
 * что-то в форме или поле ввода не так, то рядом с полем должно быть
 * отображение ошибки, это общее правило»).
 *
 * - ошибка ввода — `Field error` / `FieldError` под тем полем, где ошибка;
 * - отказ сервера на всю форму — `FormError` у кнопки отправки;
 * - тост (`lib/notice`) — только итог действия вне формы. Ошибку поля тостом
 *   не показываем: он уходит, стоит далеко от поля и не говорит, где править.
 *
 * Значок рядом с текстом — чтобы ошибку видели не только по цвету.
 */
export function FieldError({
  id,
  children,
  className,
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      id={id}
      role="alert"
      className={cn("flex items-start gap-1 text-xs leading-snug text-destructive", className)}
    >
      <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** Отказ на всю форму (сервер не принял): у кнопки отправки, форма открыта. */
export function FormError({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      role="alert"
      className={cn(
        "flex min-w-0 items-start gap-1.5 text-sm leading-snug text-destructive",
        className,
      )}
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/**
 * Подпись сверху, контрол, под ним подсказка или ошибка. Подпись обнимает
 * контрол (связь без `id`), сам контрол получает `aria-invalid` и
 * `aria-describedby` на строку под ним. Ошибка заменяет подсказку, а не
 * встаёт второй строкой.
 */
export function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  /** Текст ошибки; пусто — ошибки нет. */
  error?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const noteId = React.useId();
  const note = error || hint;
  const control = React.isValidElement<{
    "aria-invalid"?: boolean;
    "aria-describedby"?: string;
  }>(children)
    ? React.cloneElement(children, {
        "aria-invalid": error ? true : undefined,
        "aria-describedby": note ? noteId : undefined,
      })
    : children;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={eyebrow({ weight: "medium" })}>{label}</span>
        {control}
      </label>
      {error ? (
        <FieldError id={noteId}>{error}</FieldError>
      ) : hint ? (
        <p id={noteId} className="text-xs leading-snug text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
