import { Loader2, X } from "lucide-react";
import { DialogFooter, DialogHeader, DialogShell } from "@/components/ui/dialog-shell";
import { Button } from "@/components/ui/button";
import { useT, type MsgKey } from "@/lib/i18n";
import { FormError } from "@/components/ui/field";

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
  icon,
  children,
  onClose,
  onSubmit,
  submitLabel,
  disabled,
  pending,
  error,
  tone,
  sheet,
}: {
  title: string;
  /** Значок в шапке, `size-4 text-muted-foreground`, как у «Сообщить о проблеме». */
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel?: string;
  disabled?: boolean;
  /** Команда выполняется. */
  pending?: boolean;
  /** Ключ сообщения об отказе; `null` — отказа не было. */
  error?: MsgKey | null;
  /** `destructive` — действие класса `confirm` (`actionRisk.ts`): меняет учёт. */
  tone?: "destructive";
  /**
   * Короткое подтверждение на ТСД: на телефоне шторка снизу, кнопки 40 px на
   * всю ширину (`DialogShell` `sheet`).
   */
  sheet?: boolean;
}) {
  const t = useT();
  return (
    <DialogShell size="lg" scroll sheet={sheet} onClose={onClose}>
      {/* Шапка по образцу «Сообщить о проблеме»: значок, заголовок и крестик. */}
      <DialogHeader>
        <div className="flex min-w-0 items-center gap-2">
          {icon}
          <p className="text-sm font-semibold">{title}</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t("support.close")}>
          <X className="size-4" />
        </Button>
      </DialogHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">{children}</div>
      <DialogFooter spread={!!error && !sheet}>
        {error && !sheet && <FormError className="flex-1 text-xs">{t(error)}</FormError>}
        {/* Отмену не блокируем даже во время команды: если запрос повис,
            единственный выход из окна не должен быть заперт вместе с ним. */}
        <div
          className={
            sheet
              ? "flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:items-center"
              : "flex shrink-0 items-center gap-2"
          }
        >
          <Button
            size={sheet ? "lg" : "sm"}
            variant="ghost"
            className={sheet ? "w-full sm:w-auto" : undefined}
            onClick={onClose}
          >
            {t("common.cancel")}
          </Button>
          <Button
            size={sheet ? "lg" : "sm"}
            variant={tone}
            className={sheet ? "w-full sm:w-auto" : undefined}
            disabled={disabled || pending}
            onClick={onSubmit}
          >
            {pending && <Loader2 className="animate-spin" />}
            {pending
              ? t("data.busy")
              : error
                ? t("data.retry")
                : (submitLabel ?? t("common.create"))}
          </Button>
          {error && sheet && <FormError className="text-xs">{t(error)}</FormError>}
        </div>
      </DialogFooter>
    </DialogShell>
  );
}
