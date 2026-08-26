import { useEffect, useRef, useState } from "react";
import { ScanLine } from "lucide-react";
import { useScannerInput } from "@/lib/useScannerInput";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

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

export type ScanStatus = "idle" | "ok" | "error";

export function ScanField({
  label,
  hint,
  placeholder,
  status = "idle",
  minLength,
  disabled,
  autoFocus = true,
  onSubmit,
}: {
  label: string;
  hint?: string;
  placeholder?: string;
  status?: ScanStatus;
  minLength?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  onSubmit: (code: string) => void;
}) {
  const t = useT();
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = (raw: string) => {
    const code = raw.trim();
    if (!code || disabled) return;
    setValue("");
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
      <label
        htmlFor="scan-input"
        className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
      >
        {label}
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <ScanLine
            className={cn(
              "pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 transition-colors",
              status === "ok"
                ? "text-emerald-500"
                : status === "error"
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
            onChange={(e) => setValue(e.target.value)}
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
              status === "ok"
                ? "border-emerald-500 ring-2 ring-emerald-500/30"
                : status === "error"
                  ? "border-destructive ring-2 ring-destructive/30"
                  : "border-input",
            )}
          />
        </div>
        <Button
          variant="outline"
          className="h-11 shrink-0"
          disabled={disabled || !value.trim()}
          onClick={() => submit(value)}
        >
          {t("scan.apply")}
        </Button>
      </div>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
