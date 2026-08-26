import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Ввод фактического количества. Именно ручной ввод, а не серия сканирований
 * одного товара: приёмка — это сверка партии, а не поштучный пересчёт
 * (поштучно считают на сборке, там своя логика).
 */
export function QtyStepper({
  value,
  onChange,
  max,
  autoFocus,
}: {
  value: number;
  onChange: (v: number) => void;
  max?: number;
  autoFocus?: boolean;
}) {
  const clampQty = (v: number) => {
    const n = Math.round(Number.isFinite(v) ? v : 0);
    if (n < 0) return 0;
    if (max != null && n > max) return max;
    return n;
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label="−1"
        onClick={() => onChange(clampQty(value - 1))}
        className="flex size-10 items-center justify-center rounded-lg border border-input bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Minus className="size-4" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        autoFocus={autoFocus}
        value={String(value)}
        onChange={(e) => onChange(clampQty(parseInt(e.target.value, 10)))}
        onFocus={(e) => e.target.select()}
        className={cn(
          "h-10 w-24 rounded-lg border border-input bg-background text-center text-lg font-semibold tabular-nums shadow-sm",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      />
      <button
        type="button"
        aria-label="+1"
        onClick={() => onChange(clampQty(value + 1))}
        className="flex size-10 items-center justify-center rounded-lg border border-input bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
