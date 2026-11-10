import { Check, Pencil, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

/**
 * Строка настроек профиля: подпись слева узкой колонкой, значение сразу за
 * ней, а не у дальнего края — глаз не бегает через пустую ширину.
 *
 * Правится КАЖДОЕ поле по отдельности (п.1): карандаш открывает одну строку, а
 * не весь экран, и сохраняется тоже одна строка. Общий режим «редактировать
 * всё» заставлял человека держать в голове, что именно он поменял, и превращал
 * отмену в откат всех правок разом.
 */

export function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-12 items-center gap-4 py-2">
      {/* Подпись не сжимается, значение занимает остаток строки: в правке поле
          должно тянуться, а не упираться в край карточки. */}
      <div className="flex w-36 shrink-0 items-center gap-2 text-muted-foreground sm:w-44">
        {icon}
        <Label className="text-sm font-normal text-muted-foreground">{label}</Label>
      </div>
      <div className="flex min-w-0 flex-1 justify-start">{children}</div>
    </div>
  );
}

/** Значение в режиме просмотра + карандаш, открывающий эту строку. */
export function ReadValue({
  value,
  mono,
  onEdit,
  children,
}: {
  value?: string;
  mono?: boolean;
  onEdit: () => void;
  /** Сложное значение вместо строки — например реквизиты в три строки. */
  children?: React.ReactNode;
}) {
  const t = useT();
  return (
    <div className="group/row flex min-w-0 items-center justify-start gap-1.5">
      {children ?? (
        <span
          className={cn(
            "max-w-56 truncate text-sm",
            mono && "font-mono text-xs",
            !value && "text-muted-foreground",
          )}
        >
          {value || "—"}
        </span>
      )}
      <button
        type="button"
        onClick={onEdit}
        title={t("profile.editField")}
        aria-label={t("profile.editField")}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground group-hover/row:text-muted-foreground"
      >
        <Pencil className="size-3.5" />
      </button>
    </div>
  );
}

/**
 * Правка одной строки: поле (или несколько) плюс галочка и крестик.
 * Enter сохраняет, Escape отменяет — обычные клавиши формы.
 */
export function RowEditor({
  onSave,
  onCancel,
  canSave = true,
  hint,
  children,
}: {
  onSave: () => void;
  onCancel: () => void;
  canSave?: boolean;
  /** Подсказка или ошибка под полем. */
  hint?: { text: string; error?: boolean } | null;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- обёртка ничего не ловит сама: она слушает всплывающие Enter/Escape от полей и кнопок внутри, а они и есть настоящие элементы управления
    <div
      className="flex w-full min-w-0 flex-col items-end gap-1"
      onKeyDown={(e) => {
        if (e.key === "Enter" && canSave) {
          e.preventDefault();
          onSave();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
    >
      <div className="flex w-full min-w-0 items-center gap-1.5">
        <div className="min-w-0 flex-1">{children}</div>
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          title={t("common.save")}
          aria-label={t("common.save")}
          className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-40"
        >
          <Check className="size-4" />
        </button>
        <button
          type="button"
          onClick={onCancel}
          title={t("common.cancel")}
          aria-label={t("common.cancel")}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
      {hint && (
        <span className={cn("text-xs", hint.error ? "text-destructive" : "text-muted-foreground")}>
          {hint.text}
        </span>
      )}
    </div>
  );
}
