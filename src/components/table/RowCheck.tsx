import { Check } from "lucide-react";
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
        checked || partial
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input hover:border-primary/60",
      )}
    >
      {partial ? (
        <span className="h-0.5 w-2 rounded-full bg-current" />
      ) : checked ? (
        <Check className="size-3" />
      ) : null}
    </button>
  );
}
