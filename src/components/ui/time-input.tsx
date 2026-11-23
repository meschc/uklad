import { useId, useState } from "react";
import { Input } from "./input";
import { FieldError } from "./field";
import { formatTimeText, parseTimeText } from "@/lib/timeText";
import { useT } from "@/lib/i18n";

/**
 * Время простым полем (Кирилл 22.11): «1300» превращается в 13:00. Часы не
 * больше 23, минуты не больше 59 — при отказе поле краснеет и под ним сказано,
 * как набрать. Значение — минуты от полуночи; ночная смена (конец раньше
 * начала) — забота того, кто читает пару значений.
 */
export function TimeInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: number;
  onChange: (min: number) => void;
  ariaLabel?: string;
}) {
  const t = useT();
  const id = useId();
  const [text, setText] = useState(formatTimeText(value));
  const [bad, setBad] = useState(false);
  // Значение извне (другой склад, сброс) — в поле: подстройка во время
  // отрисовки, а не эффект, чтобы не было лишней перерисовки.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setText(formatTimeText(value));
    setBad(false);
  }
  const commit = () => {
    const min = parseTimeText(text);
    if (min == null) {
      setBad(true);
      return;
    }
    setBad(false);
    setText(formatTimeText(min));
    if (min !== ((value % 1440) + 1440) % 1440) onChange(min);
  };
  return (
    <span className="inline-flex flex-col gap-1">
      <Input
        inputMode="numeric"
        autoComplete="off"
        maxLength={5}
        value={text}
        aria-label={ariaLabel}
        aria-invalid={bad || undefined}
        aria-describedby={bad ? id : undefined}
        placeholder="13:00"
        onChange={(e) => {
          setText(e.target.value);
          setBad(false);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
        className="w-20 text-center tabular-nums"
      />
      {bad && <FieldError id={id}>{t("time.invalid")}</FieldError>}
    </span>
  );
}
