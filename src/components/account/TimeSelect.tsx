import { useRef, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDismiss } from "@/lib/useDismiss";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Выбор времени без набора с клавиатуры: кнопка «13:00» раскрывает под собой
 * две колонки — часы и минуты с шагом 5. Нажал час, нажал минуты — готово.
 * Системный `<input type="time">` в каждом браузере свой и в тёмной теме
 * выглядит чужим, поэтому свой.
 */
export function TimeSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (min: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const v = ((value % 1440) + 1440) % 1440;
  const h = Math.floor(v / 60);
  const m = v % 60;
  useDismiss(open, ref, () => setOpen(false));
  const cell = (on: boolean) =>
    cn(
      "flex h-8 w-12 shrink-0 items-center justify-center rounded-lg text-sm tabular-nums transition-colors",
      on ? "bg-primary text-primary-foreground" : "hover:bg-accent",
    );
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 items-center gap-1.5 rounded-lg bg-muted px-2.5 text-sm font-medium tabular-nums hover:bg-accent"
      >
        <Clock className="size-3.5 text-muted-foreground" />
        {pad(h)}:{pad(m)}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 flex animate-fade-in gap-1 rounded-xl bg-popover p-1 shadow-lg ring-1 ring-border">
          <div className="scrollbar-thin flex max-h-56 flex-col gap-0.5 overflow-y-auto">
            {HOURS.map((x) => (
              <button
                key={x}
                type="button"
                className={cell(x === h)}
                onClick={() => onChange(x * 60 + m)}
              >
                {pad(x)}
              </button>
            ))}
          </div>
          <div className="scrollbar-thin flex max-h-56 flex-col gap-0.5 overflow-y-auto">
            {MINUTES.map((x) => (
              <button
                key={x}
                type="button"
                className={cell(x === m)}
                onClick={() => {
                  onChange(h * 60 + x);
                  setOpen(false);
                }}
              >
                {pad(x)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
