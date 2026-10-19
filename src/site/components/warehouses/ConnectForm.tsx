import { useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/utils";
import { ConsentChecks, type ConsentState } from "../ConsentChecks";
import { LeadSubmit } from "../LeadSubmit";
import { ru, useT } from "../../lib/copy";
import { useLeadSend } from "../../lib/useLeadSend";

const T = {
  name: ru("Имя"),
  namePh: ru("Как к вам обращаться"),
  contact: ru("Как с вами связаться"),
  contactPh: ru("Телефон или почта"),
  accounting: ru("Как сейчас ведёте учёт"),
  optional: ru("необязательно"),
  excel: ru("Excel"),
  other: ru("Другая программа"),
  none: ru("Не ведём"),
  send: ru("Подключить склад"),
  consentNote: ru("Отметьте согласие на обработку данных, без него заявку не отправить."),
  subject: ru("Подключение склада — {name}"),
};

type Accounting = "" | "excel" | "other" | "none";

const EMPTY_CONSENT: ConsentState = { data: false, ads: false };

/**
 * Заявка на подключение склада. Одна и та же форма стоит дважды: внутри
 * первого шага пути подключения и в конце страницы. Отправляют обе одно и то
 * же, поэтому и форма одна — две копии разошлись бы на первой правке полей.
 *
 * Полей минимум (решение 19 окт): имя и контакт. Название склада и город на
 * первом контакте не нужны, а каждое лишнее поле стоит заявок. Способ учёта —
 * необязательный выбор в один клик: к знакомству уже понятно, что переносить.
 *
 * `idPrefix` разводит `id` полей: на странице две формы, и одинаковые `id`
 * сломали бы связь подписи с полем во второй.
 */
export function ConnectForm({ idPrefix, className }: { idPrefix: string; className?: string }) {
  const t = useT();
  const [consent, setConsent] = useState<ConsentState>(EMPTY_CONSENT);
  const [accounting, setAccounting] = useState<Accounting>("");
  const lead = useLeadSend();

  const accountingLabel = {
    "": "",
    excel: t(T.excel),
    other: t(T.other),
    none: t(T.none),
  }[accounting];

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const name = String(data.get("name") ?? "");

    lead.send({
      kind: "connect",
      lang: t.lang,
      subject: t(T.subject, { name }),
      fields: [
        { label: t(T.name), value: name },
        { label: t(T.contact), value: String(data.get("contact") ?? "") },
        { label: t(T.accounting), value: accountingLabel },
      ],
      consent,
    });
  };

  return (
    <form onSubmit={submit} className={cn("flex flex-col gap-4", className)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${idPrefix}-name`} name="name" label={t(T.name)} placeholder={t(T.namePh)} />
        <Field
          id={`${idPrefix}-contact`}
          name="contact"
          label={t(T.contact)}
          placeholder={t(T.contactPh)}
        />
      </div>

      <div>
        <p className="text-sm font-medium">
          {t(T.accounting)}{" "}
          <span className="font-normal text-muted-foreground">· {t(T.optional)}</span>
        </p>
        {/* Повторный клик снимает выбор: поле необязательное, и выбрать
            «ничего» должно быть так же просто, как выбрать вариант. */}
        <Segmented<Accounting>
          size="md"
          grow
          value={accounting}
          onChange={(v) => setAccounting(v === accounting ? "" : v)}
          ariaLabel={t(T.accounting)}
          className="mt-1.5"
          options={[
            { value: "excel", label: t(T.excel) },
            { value: "other", label: t(T.other) },
            { value: "none", label: t(T.none) },
          ]}
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

function Field({
  id,
  name,
  label,
  placeholder,
  type = "text",
}: {
  id: string;
  name: string;
  label: string;
  placeholder: string;
  type?: "text" | "email";
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        <span className="ml-0.5 text-primary">*</span>
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required
        placeholder={placeholder}
        className="mt-1.5 h-10 w-full rounded-full border border-border bg-background px-4 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary"
      />
    </div>
  );
}

/** То же поле нужно форме демо-доступа: одна высота и одна форма на странице. */
export { Field as FormField };
