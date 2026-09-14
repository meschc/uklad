import { Loader2 } from "lucide-react";
import { DialogFooter, DialogHeader, DialogShell } from "@/components/ui/dialog-shell";
import { Button } from "@/components/ui/button";
import { eyebrow } from "@/components/ui/eyebrow";
import { useT, type MsgKey } from "@/lib/i18n";

/**
 * Модальное окно фулфилмента: шапка, тело с прокруткой, подвал с двумя
 * действиями. Отдельным файлом, потому что им пользуются и заявка продавца, и
 * массовое создание заявок, и таблица номенклатуры — три копии одного диалога
 * разъехались бы по отступам.
 *
 * Ожидание и отказ команды тоже живут здесь, а не в каждом окне (п.3.2.2):
 * пока команда идёт, кнопка занята; если не вышло — окно НЕ закрывается,
 * сообщение встаёт слева, а сама кнопка становится повтором. Набранная форма
 * при этом цела: заставлять человека вводить заявку заново из-за обрыва связи
 * — худшее, что можно сделать.
 */
export function Modal({
  title,
  children,
  onClose,
  onSubmit,
  submitLabel,
  disabled,
  pending,
  error,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel?: string;
  disabled?: boolean;
  /** Команда выполняется. */
  pending?: boolean;
  /** Ключ сообщения об отказе; `null` — отказа не было. */
  error?: MsgKey | null;
}) {
  const t = useT();
  return (
    <DialogShell size="lg" scroll onClose={onClose}>
      <DialogHeader>
        <p className="text-sm font-semibold">{title}</p>
      </DialogHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">{children}</div>
      <DialogFooter spread={!!error}>
        {error && (
          <p role="alert" className="min-w-0 flex-1 text-xs text-destructive">
            {t(error)}
          </p>
        )}
        {/* Отмену не блокируем даже во время команды: если запрос повис,
            единственный выход из окна не должен быть заперт вместе с ним. */}
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button size="sm" disabled={disabled || pending} onClick={onSubmit}>
            {pending && <Loader2 className="animate-spin" />}
            {pending
              ? t("data.busy")
              : error
                ? t("data.retry")
                : (submitLabel ?? t("common.create"))}
          </Button>
        </div>
      </DialogFooter>
    </DialogShell>
  );
}

/** Поле формы диалога: подпись сверху, контрол снизу. */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className={eyebrow()}>{label}</span>
      {children}
    </label>
  );
}
