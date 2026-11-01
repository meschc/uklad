import { useState } from "react";
import { cn } from "@/lib/utils";
import { ConsentChecks, type ConsentState } from "../ConsentChecks";
import { ContactField } from "../ContactField";
import { contactKind } from "../../lib/contact";
import { LeadSubmit } from "../LeadSubmit";
import { ru, useT } from "../../lib/copy";
import { useLeadSend } from "../../lib/useLeadSend";

const T = {
  mail: ru("Почта"),
  mailPh: ru("name@company.ru"),
  note: ru(
    "Пришлём на почту личную ссылку на демо-кабинет. Она работает 14 дней, склад в демо — учебный, ломайте что угодно.",
  ),
  expired: ru("Ссылка на демо устарела. Оставьте почту — пришлём новую."),
  notMail: ru("Нужна почта: ссылка на демо приходит письмом."),
  send: ru("Получить ссылку"),
  sent: ru(
    "Письмо со ссылкой уже в пути. Если его нет через пару минут — загляните в «Спам» и проверьте адрес.",
  ),
  consentNote: ru("Отметьте согласие на обработку данных. Без него заявку не подать."),
  subject: ru("Демо — {mail}"),
};

const EMPTY_CONSENT: ConsentState = { data: false, ads: false };

/**
 * Заявка на демо: почта и согласие, больше ничего.
 *
 * Кабинет в сборке с сервером без входа закрыт, и открывает демо только
 * личная ссылка из письма (`server/api`, `GET /d/<токен>`). Поэтому поле одно
 * и это почта: телефон здесь бесполезен, ссылку на него не отправить.
 *
 * `expired` — человек вернулся по устаревшей ссылке (`/?demo=expired#demo`):
 * говорим об этом над формой, а не молча показываем пустую.
 */
export function DemoForm({
  idPrefix,
  expired = false,
  className,
}: {
  idPrefix: string;
  expired?: boolean;
  className?: string;
}) {
  const t = useT();
  const [consent, setConsent] = useState<ConsentState>(EMPTY_CONSENT);
  const [mail, setMail] = useState("");
  const [tried, setTried] = useState(false);
  const lead = useLeadSend();
  const kind = contactKind(mail);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setTried(true);
    if (!consent.data || kind !== "email") return;
    const value = mail.trim();
    lead.send({
      kind: "demo",
      lang: t.lang,
      subject: t(T.subject, { mail: value }),
      fields: [{ label: t(T.mail), value }],
      consent,
    });
  };

  return (
    <form onSubmit={submit} className={cn("flex flex-col gap-4", className)}>
      <p className="text-[15px] leading-relaxed text-muted-foreground">
        {t(expired ? T.expired : T.note)}
      </p>
      <ContactField
        id={`${idPrefix}-mail`}
        label={t(T.mail)}
        placeholder={t(T.mailPh)}
        value={mail}
        onChange={setMail}
        tried={tried}
        inputClassName={FIELD}
      />
      {tried && kind === "phone" && (
        <p role="alert" className="-mt-2 text-xs leading-relaxed text-destructive">
          {t(T.notMail)}
        </p>
      )}

      <ConsentChecks value={consent} onChange={setConsent} />

      <LeadSubmit lead={lead} idle={t(T.send)} sentNote={t(T.sent)} type="submit" />
      {tried && !consent.data && (
        <p role="alert" className="-mt-1 text-xs leading-relaxed text-destructive">
          {t(T.consentNote)}
        </p>
      )}
    </form>
  );
}

const FIELD =
  "mt-1.5 h-12 w-full rounded-xl border border-border bg-background px-4 text-base outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary";
