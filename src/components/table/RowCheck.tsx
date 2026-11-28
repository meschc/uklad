import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Чекбокс строки. Свой, а не нативный: нативный `indeterminate` ставится
 * только из JS, а в шапке нужно именно третье состояние «часть отмечена».
 */
export function RowCheck({
  checked,
  partial,
  onChange,
  label,
  title,
}: {
  checked: boolean;
  partial?: boolean;
  /** Событие нужно целиком: Shift тянет диапазон строк. */
  onChange: (e: React.MouseEvent) => void;
  label: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={partial ? "mixed" : checked}
      aria-label={label}
      title={title}
      onClick={onChange}
      className={cn(
        "flex size-4 items-center justify-center rounded border transition-colors",
        // Телефон: 20 px и невидимая область 44 px вокруг — под палец.
        "relative before:absolute before:-inset-3 before:content-[''] max-md:size-5",
        checked || partial
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input hover:border-primary/60",
      )}
    >
      {/* Значок — всегда svg одного размера, пустой — невидим: у кнопки без
          значка или с полоской-span другая базовая линия, и шапка таблицы
          прыгала на 1–3 px при первой отметке («дёргается кнопка», разбор 27.11). */}
      {partial ? (
        <Minus className="size-3" strokeWidth={3} />
      ) : (
        <Check className={cn("size-3", !checked && "invisible")} />
      )}
    </button>
  );
}
