import { useEffect, useRef, useState } from "react";
import { ScanLine } from "lucide-react";
import { useScannerInput } from "@/lib/useScannerInput";
import { useT } from "@/lib/i18n";
import { SHIFT_CODE_PREFIX } from "@/lib/workstation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { eyebrow } from "@/components/ui/eyebrow";
import { CameraScanButton } from "./CameraScan";

/**
 * Поле скана. Физический HID-сканер «печатает» код прямо в сфокусированное
 * поле и жмёт Enter — поэтому основной путь тут обычный input. Глобальный
 * хук `useScannerInput` нужен для второго случая: фокус увели кликом по
 * кнопке, а кладовщик всё равно выстрелил сканером.
 *
 * Чтобы пути не сработали оба на одном скане, глобальный слушатель включён
 * только когда поле НЕ в фокусе — тогда путь ровно один и гасить повторы не
 * нужно. Фильтр по «такому же коду» здесь был бы вреден: на сборке один и тот
 * же артикул сканируют подряд, и каждая вторая единица просто терялась бы.
 */

/** Событие окна: отсканирован код отметки смены. */
export const SHIFT_SCAN_EVENT = "uklad:shift-scan";

/** Время последнего скана — по нему шапка стола видит, что сканер работает. */
/** Событие окна: в любое поле скана пришёл код. */
export const SCAN_EVENT = "uklad:scan";

export let lastScanAt: number | null = null;

export type ScanStatus = "idle" | "ok" | "error";

export function ScanField({
  label,
  hint,
  placeholder,
  status = "idle",
  minLength,
  disabled,
  autoFocus = true,
  actionLabel,
  onSubmit,
}: {
  label: string;
  hint?: string;
  placeholder?: string;
  status?: ScanStatus;
  minLength?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Подпись кнопки: по умолчанию «Принять», у упаковки — своё действие. */
  actionLabel?: string;
  onSubmit: (code: string) => void;
}) {
  const t = useT();
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  // Новый ввод гасит прошлую ошибку: красная рамка держится до первой буквы.
  const [typing, setTyping] = useState(false);
  const shown: ScanStatus = typing ? "idle" : status;
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = (raw: string) => {
    const code = raw.trim();
    if (!code || disabled) return;
    lastScanAt = Date.now();
    window.dispatchEvent(new Event(SCAN_EVENT));
    setValue("");
    setTyping(false);
    // Код отметки смены не относится к шагу экрана: его ловит рабочее место.
    if (code.toUpperCase().startsWith(SHIFT_CODE_PREFIX)) {
      window.dispatchEvent(new CustomEvent(SHIFT_SCAN_EVENT, { detail: code }));
      return;
    }
    onSubmit(code);
  };

  useScannerInput({
    onScan: submit,
    // Пока фокус в поле, сканер и так печатает прямо в него — второй слушатель
    // только удваивал бы событие.
    enabled: !disabled && !focused,
    minLength,
  });

  // Возвращаем фокус в поле после каждого шага мастера: кладовщик работает
  // сканером, а не мышью — лишний клик по полю сбивает темп.
  useEffect(() => {
    if (autoFocus && !disabled) inputRef.current?.focus();
  }, [autoFocus, disabled, label]);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="scan-input" className={eyebrow()}>
        {label}
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <ScanLine
            className={cn(
              "pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 transition-colors",
              shown === "ok"
                ? "text-emerald-500"
                : shown === "error"
                  ? "text-destructive"
                  : "text-muted-foreground",
            )}
          />
          <input
            id="scan-input"
            ref={inputRef}
            data-scanner-target="1"
            value={value}
            disabled={disabled}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setValue(e.target.value);
              setTyping(true);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit(value);
              }
            }}
            placeholder={placeholder ?? t("scan.placeholder")}
            className={cn(
              "h-11 w-full rounded-lg border bg-background pl-9 pr-3 font-mono text-sm shadow-sm transition-colors",
              "placeholder:font-sans placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "disabled:cursor-not-allowed disabled:opacity-50",
              // Цвет рамки при фокусе — тот же, что у статуса: синяя поверх
              // красной читалась как две ошибки.
              shown === "ok"
                ? "border-emerald-500 ring-2 ring-emerald-500/30 focus-visible:ring-emerald-500/30"
                : shown === "error"
                  ? "border-destructive ring-2 ring-destructive/30 focus-visible:ring-destructive/30"
                  : "border-input",
            )}
          />
        </div>
        <CameraScanButton disabled={disabled} onCode={submit} />
        <Button
          variant="outline"
          className="h-11 shrink-0"
          disabled={disabled || !value.trim()}
          onClick={() => submit(value)}
        >
          {actionLabel ?? t("scan.apply")}
        </Button>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
