import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

/**
 * Модальное окно фулфилмента: шапка, тело с прокруткой, подвал с двумя
 * действиями. Отдельным файлом, потому что им пользуются и заявка продавца, и
 * массовое создание заявок, и таблица номенклатуры — три копии одного диалога
 * разъехались бы по отступам.
 */
export function Modal({
  title,
  children,
  onClose,
  onSubmit,
  submitLabel,
  disabled,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel?: string;
  disabled?: boolean;
}) {
  const t = useT();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 animate-fade-in bg-black/40 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div className="relative flex max-h-[88vh] w-full max-w-lg animate-scale-in flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <div className="border-b border-border px-5 py-3">
          <p className="text-sm font-semibold">{title}</p>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
          {children}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3">
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button size="sm" disabled={disabled} onClick={onSubmit}>
            {submitLabel ?? t("common.create")}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Поле формы диалога: подпись сверху, контрол снизу. */
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
