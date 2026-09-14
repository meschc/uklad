import { Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { ORG } from "../data/org";
import { c, useT } from "../lib/copy";
import type { LeadSend } from "../lib/useLeadSend";

/**
 * Кнопка отправки формы витрины и строка над ней.
 *
 * Форм две — контакты и заявка складу, — и обе рассказывают человеку одно и то
 * же: чем кнопка занята сейчас и чем всё кончилось. Держать это двумя копиями
 * значит однажды поправить одну: там появится «письмо не ушло», а здесь так и
 * останется бодрое «Отправлено».
 *
 * Подпись живёт **до** кнопки, а не после. Её читают перед нажатием — когда
 * ещё можно отметить галочку или дозаполнить поле, — а не после того, как
 * нажатие ничего не дало.
 */

const T = {
  mailCta: c("Написать письмо", "Write an email"),
  sending: c("Отправляем…", "Sending…"),
  sent: c("Отправлено", "Sent"),
  mailed: c("Письмо открыто", "Email opened"),
  retry: c("Повторить", "Try again"),

  mailNote: c(
    "Кнопка откроет письмо в почтовой программе — поля уже подставлены. Отправить его нужно самому: со своего адреса, чтобы нам было куда отвечать.",
    "The button opens a prefilled letter in your email app. You send it yourself, from your own address, so we have somewhere to reply.",
  ),
  sentNote: c(
    "Заявка ушла. Ответим в рабочие часы; если ответа не будет — напишите на {mail}.",
    "The request is sent. We answer within working hours; if we do not, write to {mail}.",
  ),
  mailedNote: c(
    "Письмо открыто в почтовой программе. Проверьте, что оно ушло — если программа не открылась, напишите на {mail}.",
    "The letter is open in your email app. Check that it was sent — if the app did not open, write to {mail}.",
  ),
  failedNote: c(
    "Отправить не получилось: связь оборвалась или приёмник не ответил. Попробуйте ещё раз или напишите на {mail}.",
    "Sending failed: the connection dropped or the receiver did not answer. Try again or write to {mail}.",
  ),
};

export function LeadSubmit({
  lead,
  idle,
  mailIdle,
  blocker = null,
  type = "button",
  onClick,
  icon = false,
  className,
}: {
  lead: LeadSend;
  /** Подпись в покое, когда приёмник настроен: «Отправить заявку в 3 склада». */
  idle: string;
  /**
   * Подпись в покое, когда приёмника нет и кнопка откроет письмо. Нужна там,
   * где в подписи стоит объём действия — «в 3 склада»: общее «Написать письмо»
   * его теряет, а человек обязан видеть охват именно в момент нажатия.
   */
  mailIdle?: string;
  /** Чего не хватает для отправки. Пока не пусто — кнопка заблокирована. */
  blocker?: string | null;
  /** Контакты отправляются формой — там нужна встроенная проверка полей. */
  type?: "button" | "submit";
  onClick?: () => void;
  icon?: boolean;
  className?: string;
}) {
  const t = useT();
  const { state, online } = lead;

  const done = state === "sent" || state === "mailed";
  const blocked = blocker !== null && state === "idle";
  const disabled = blocked || state === "sending" || done;

  const label = () => {
    if (state === "sending") return t(T.sending);
    if (state === "sent") return t(T.sent);
    if (state === "mailed") return t(T.mailed);
    if (state === "failed") return t(T.retry);
    if (online) return idle;
    return mailIdle ?? t(T.mailCta);
  };

  const note = () => {
    if (state === "sent") return t(T.sentNote, { mail: ORG.email });
    if (state === "mailed") return t(T.mailedNote, { mail: ORG.email });
    if (state === "failed") return t(T.failedNote, { mail: ORG.email });
    if (state === "sending") return null;
    if (blocker) return blocker;
    return online ? null : t(T.mailNote);
  };

  const text = note();

  return (
    <div className={className}>
      {text && <p className="text-[12px] leading-relaxed text-muted-foreground">{text}</p>}

      <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        className={cn(
          "inline-flex h-11 w-full items-center justify-center gap-2 rounded-full px-5 text-sm font-medium transition-colors",
          text && "mt-4",
          done
            ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
            : "bg-primary text-primary-foreground enabled:hover:bg-primary/90 disabled:opacity-45",
        )}
      >
        {icon && !done && state !== "sending" && <Send className="size-4" />}
        {label()}
      </button>
    </div>
  );
}
