import { Minus, Plus } from "lucide-react";
import { clamp, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/**
 * Мелочь, из которой собраны все панели инспектора: строка «подпись — значение»,
 * счётчик и полоска ячеек полки.
 *
 * Каждая встречается в трёх-четырёх панелях. Пока они лежали в общем файле
 * рядом с самими панелями, разница между «полкой у одной секции» и «полкой у
 * выделения» была делом копипасты — и полоски ячеек успели разъехаться.
 */

/** Строка панели: подпись слева, управление справа. */
export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="shrink-0">{label}</Label>
      <div className="flex items-center gap-1.5">{children}</div>
    </div>
  );
}

/** Счётчик «−  N  +» с жёсткими границами: мимо допуска ввести нечего. */
export function Stepper({
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon-sm"
        className="h-7 w-7"
        disabled={disabled || value <= min}
        onClick={() => onChange(clamp(value - 1, min, max))}
      >
        <Minus className="size-3.5" />
      </Button>
      <span className="w-6 text-center text-sm font-medium tabular-nums">{value}</span>
      <Button
        variant="outline"
        size="icon-sm"
        className="h-7 w-7"
        disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + 1, min, max))}
      >
        <Plus className="size-3.5" />
      </Button>
    </div>
  );
}

/** Полка сверху: столько равных долей, сколько в ней ячеек. */
export function CellStrip({ cells, className }: { cells: number; className?: string }) {
  return (
    <div
      className={cn("flex h-4 w-full overflow-hidden rounded-sm border border-border", className)}
    >
      {Array.from({ length: cells }).map((_, j) => (
        <span
          key={j}
          className={cn(
            "min-w-0 flex-1 bg-module-section",
            j > 0 && "border-l border-black/15 dark:border-white/15",
          )}
        />
      ))}
    </div>
  );
}
