import { useState } from "react";
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
  excel: ru("Excel и таблицы"),
  oneC: ru("1С"),
  other: ru("Другая программа"),
  none: ru("Пока никак"),
  send: ru("Отправить заявку"),
  consentNote: ru("Отметьте согласие на обработку данных, без него заявку не отправить."),
  subject: ru("Подключение склада — {name}"),
};

type Accounting = "" | "excel" | "1c" | "other" | "none";

const EMPTY_CONSENT: ConsentState = { data: false, ads: false };

/**
 * Заявка на подключение склада: стоит в финальном блоке страницы, в карточке
 * в виде складского ярлыка.
 *
 * Полей минимум (решение 19 окт): имя и контакт. Название склада и город на
 * первом контакте не нужны, а каждое лишнее поле стоит заявок. Способ учёта —
 * необязательный выбор в один клик: к знакомству уже понятно, что переносить.
 *
 * `idPrefix` разводит `id` полей: если форма встанет на страницу второй
 * раз, одинаковые `id` сломали бы связь подписи с полем.
 */
export function ConnectForm({ idPrefix, className }: { idPrefix: string; className?: string }) {
  const t = useT();
  const [consent, setConsent] = useState<ConsentState>(EMPTY_CONSENT);
  const [accounting, setAccounting] = useState<Accounting>("");
  const lead = useLeadSend();

  const accountingLabel = {
    "": "",
    excel: t(T.excel),
    "1c": t(T.oneC),
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

  const options: { value: Exclude<Accounting, "">; label: string }[] = [
    { value: "excel", label: t(T.excel) },
    { value: "1c", label: t(T.oneC) },
    { value: "other", label: t(T.other) },
    { value: "none", label: t(T.none) },
  ];

  return (
    <form onSubmit={submit} className={cn("flex flex-col gap-4", className)}>
      <Field id={`${idPrefix}-name`} name="name" label={t(T.name)} placeholder={t(T.namePh)} />
      <Field
        id={`${idPrefix}-contact`}
        name="contact"
        label={t(T.contact)}
        placeholder={t(T.contactPh)}
      />

      <div>
        <p id={`${idPrefix}-accounting`} className="text-sm font-medium">
          {t(T.accounting)}{" "}
          <span className="font-normal text-muted-foreground">· {t(T.optional)}</span>
        </p>
        {/* Чипы, а не переключатель: вариантов четыре, и на телефоне они
            переносятся строкой. Повторный клик снимает выбор — поле
            необязательное. */}
        <div
          role="group"
          aria-labelledby={`${idPrefix}-accounting`}
          className="mt-2 flex flex-wrap gap-2"
        >
          {options.map((o) => {
            const on = accounting === o.value;
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={on}
                onClick={() => setAccounting(on ? "" : o.value)}
                className={cn(
                  "h-9 rounded-full px-3.5 text-sm transition-colors",
                  on
                    ? "bg-foreground text-background"
                    : "bg-[var(--wh-soft,#fafafa)] shadow-[inset_0_0_0_1px_var(--wh-line,#e6e7eb)] hover:bg-[var(--wh-line,#e6e7eb)]",
                )}
              >
                {o.label}
              </button>
            );
          })}
        </div>
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
        className="mt-1.5 h-12 w-full rounded-xl border border-border bg-background px-4 text-base outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary"
      />
    </div>
  );
}
