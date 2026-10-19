import { useState } from "react";
import { cn } from "@/lib/utils";
import { ConsentChecks, type ConsentState } from "../ConsentChecks";
import { LeadSubmit } from "../LeadSubmit";
import { ru, useT } from "../../lib/copy";
import { useLeadSend } from "../../lib/useLeadSend";
import { FormField } from "./ConnectForm";

const T = {
  name: ru("Имя"),
  namePh: ru("Как к вам обращаться"),
  email: ru("Почта"),
  emailPh: ru("name@company.ru"),
  send: ru("Получить демо-доступ"),
  consentNote: ru("Отметьте согласие на обработку данных, без него ссылку не отправить."),
  subject: ru("Демо-доступ — {name}"),
};

const EMPTY_CONSENT: ConsentState = { data: false, ads: false };

/**
 * Запрос демо-доступа: имя и почта (решение 19 окт).
 *
 * Канал один — почта: Telegram в России открывается не у всех. Персональную
 * ссылку со случайным кодом выдаёт сервер, а не эта форма: имени и почты в
 * адресе ссылки быть не должно. Пока сервера нет, заявка уходит письмом, и
 * ссылку отправляют вручную, поэтому обещания «за минуту» здесь нет.
 */
export function DemoForm({ className }: { className?: string }) {
  const t = useT();
  const [consent, setConsent] = useState<ConsentState>(EMPTY_CONSENT);
  const lead = useLeadSend();

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const name = String(data.get("name") ?? "");

    lead.send({
      kind: "demo",
      lang: t.lang,
      subject: t(T.subject, { name }),
      fields: [
        { label: t(T.name), value: name },
        { label: t(T.email), value: String(data.get("email") ?? "") },
      ],
      consent,
    });
  };

  return (
    <form onSubmit={submit} className={cn("flex flex-col gap-4", className)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="demo-name" name="name" label={t(T.name)} placeholder={t(T.namePh)} />
        <FormField
          id="demo-email"
          name="email"
          type="email"
          label={t(T.email)}
          placeholder={t(T.emailPh)}
        />
      </div>
      <ConsentChecks value={consent} onChange={setConsent} />
      <LeadSubmit
        lead={lead}
        idle={t(T.send)}
        blocker={consent.data ? null : t(T.consentNote)}
        type="submit"
      />
    </form>
  );
}
