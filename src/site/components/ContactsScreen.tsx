import { useState } from "react";
import { AtSign, Building2, Clock, Phone, ShieldCheck } from "lucide-react";
import { telHref } from "@/lib/phone";
import { ORG } from "../data/org";
import { href } from "../lib/route";
import { ConsentChecks, type ConsentState } from "./ConsentChecks";
import { LeadSubmit } from "./LeadSubmit";
import { Reveal } from "./Reveal";
import { AsciiBanner } from "./frame/AsciiBanner";
import { c, useT, type Copy } from "../lib/copy";
import type { LeadField } from "../lib/leads";
import { useLeadSend } from "../lib/useLeadSend";

const T = {
  title: c("Контакты", "Contacts"),
  lead: c(
    "Напишите — ответим в рабочие часы. Вопросы про склад, интеграцию или перенос остатков лучше сразу с деталями: сколько позиций, куда отгружаете, что не устраивает сейчас.",
    "Write to us and we answer within working hours. For questions about a warehouse, an integration or moving your stock, send the details at once: how many SKUs, where you ship, what does not work today.",
  ),

  mail: c("Почта", "Email"),
  mailNote: c(
    "Общие вопросы, партнёрство, подключение склада.",
    "General questions, partnerships, connecting a warehouse.",
  ),
  privacy: c("Персональные данные", "Personal data"),
  privacyNote: c(
    "Запросы об обработке, отзыв согласия, удаление данных. Ответ — за десять рабочих дней.",
    "Processing requests, withdrawal of consent, deletion. Answered within ten business days.",
  ),
  phone: c("Телефон", "Phone"),
  hours: c("Часы работы", "Working hours"),
  requisites: c("Реквизиты", "Legal details"),
  fullDisclosure: c("Полное раскрытие", "Full disclosure"),

  fName: c("Как к вам обращаться", "Your name"),
  fNamePh: c("Имя", "Name"),
  fContact: c("Телефон или почта", "Phone or email"),
  fCompany: c("Компания", "Company"),
  fCompanyPh: c("ООО или ИП, необязательно", "Company or sole trader, optional"),
  fNeed: c("Что нужно", "What you need"),
  fNeedPh: c(
    "Например: 1 200 SKU, отгружаем на Wildberries и Ozon, ищем склад в Подмосковье",
    "For example: 1,200 SKUs, we ship to Wildberries and Ozon, looking for a warehouse near Moscow",
  ),
  formTitle: c("Написать нам", "Write to us"),
  send: c("Отправить", "Send"),
  subject: c("Вопрос с сайта — {name}", "Website enquiry — {name}"),
  consentNote: c(
    "Кнопка активна только после согласия на обработку данных — заранее проставленная галочка согласием не считается.",
    "The button unlocks only after you consent to data processing — a pre-ticked box is not consent.",
  ),
};

/**
 * Контакты.
 *
 * Кроме формы — обязательное раскрытие: наименование, адрес, почта и режим
 * работы требуются ч. 2 ст. 10 149-ФЗ и ст. 9 закона «О защите прав
 * потребителей». Печатаются из того же `ORG`, что и правовые страницы, чтобы
 * не разъехались.
 */
export function ContactsScreen() {
  const t = useT();

  return (
    <>
      {/* Сцена из трубок, конвертов и «@» (Кирилл 23 окт); главное — почта и
          телефон — прямо в баннере крупно, их ищут первыми. */}
      <AsciiBanner scene="contacts" title={t(T.title)} lead={t(T.lead)}>
        <div className="flex flex-col gap-3 text-[clamp(20px,2.2vw,28px)] tracking-[-0.02em] sm:flex-row sm:gap-10">
          <a href={`mailto:${ORG.email}`} className="w-fit transition-opacity hover:opacity-75">
            {ORG.email}
          </a>
          {ORG.phone && (
            <a
              href={telHref(ORG.phone)}
              className="w-fit tabular-nums transition-opacity hover:opacity-75"
            >
              {ORG.phone}
            </a>
          )}
        </div>
      </AsciiBanner>
      <div className="mx-auto max-w-[1280px] px-5 pb-24 pt-12 sm:px-10 sm:pt-16">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          <Reveal>
            <ContactForm />
          </Reveal>

          <Reveal delay={90} className="flex flex-col gap-4">
            <Card icon={AtSign} title={t(T.mail)}>
              <a
                href={`mailto:${ORG.email}`}
                className="font-medium text-primary transition-opacity hover:opacity-75"
              >
                {ORG.email}
              </a>
              <p className="mt-1 text-sm text-muted-foreground">{t(T.mailNote)}</p>
            </Card>

            <Card icon={ShieldCheck} title={t(T.privacy)}>
              <a
                href={`mailto:${ORG.privacyEmail}`}
                className="font-medium text-primary transition-opacity hover:opacity-75"
              >
                {ORG.privacyEmail}
              </a>
              <p className="mt-1 text-sm text-muted-foreground">{t(T.privacyNote)}</p>
            </Card>

            <Card icon={ORG.phone ? Phone : Clock} title={t(ORG.phone ? T.phone : T.hours)}>
              {/* Ссылкой, а не текстом: с телефона по нему звонят в один тап,
                а `useLinkNavigation` пропускает `tel:` мимо роутера витрины. */}
              {ORG.phone && (
                <a
                  href={telHref(ORG.phone)}
                  className="font-medium tabular-nums text-primary transition-opacity hover:opacity-75"
                >
                  {ORG.phone}
                </a>
              )}
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock className="size-3.5" />
                {t(ORG.hours)}
              </p>
            </Card>

            <Card icon={Building2} title={t(T.requisites)}>
              {/* Реквизиты не переводятся — они имеют силу в том виде, в каком
                записаны у налоговой (см. `data/org.ts`), поэтому здесь помечен язык. */}
              <p lang="ru" className="text-sm leading-relaxed text-muted-foreground">
                {ORG.legalName}
                <br />
                ИНН {ORG.inn}
              </p>
              <a
                href={href("/legal/requisites")}
                className="mt-2 inline-block text-sm font-medium text-primary transition-opacity hover:opacity-75"
              >
                {t(T.fullDisclosure)}
              </a>
            </Card>
          </Reveal>
        </div>
      </div>
    </>
  );
}

function Card({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof AtSign;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[22px] bg-[var(--wh-soft)] p-5 sm:p-6">
      <p className="flex items-center gap-2 text-sm text-[var(--wh-muted)]">
        <Icon className="size-4 text-[var(--wh-blue)]" />
        {title}
      </p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/** Поле формы: белое на сером, без рамки — как в форме склада. */
const FIELD =
  "mt-1.5 w-full rounded-xl bg-[var(--wh-ground)] px-4 text-base outline-none ring-1 ring-transparent transition-shadow placeholder:text-[var(--wh-muted)]/70 focus:ring-2 focus:ring-[var(--wh-blue)]";

const EMPTY_CONSENT: ConsentState = { data: false, ads: false };

/**
 * Форма контактов.
 *
 * Поля неуправляемые — значения читаются из `FormData` в момент отправки.
 * Ради этого всё и затевалось: браузер сам проверяет обязательные поля и сам
 * подсказывает, какое из них пустое, а состояние в React держится ровно там,
 * где без него не обойтись — согласие и ход отправки.
 */
function ContactForm() {
  const t = useT();
  const [consent, setConsent] = useState<ConsentState>(EMPTY_CONSENT);
  const lead = useLeadSend();

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const data = new FormData(e.currentTarget);
    const field = (name: string, label: Copy): LeadField => ({
      label: t(label),
      value: String(data.get(name) ?? ""),
    });

    lead.send({
      kind: "contact",
      lang: t.lang,
      subject: t(T.subject, { name: String(data.get("name") ?? "") }),
      fields: [
        field("name", T.fName),
        field("contact", T.fContact),
        field("company", T.fCompany),
        field("message", T.fNeed),
      ],
      consent,
    });
  };

  return (
    // Подложка и поля — как у формы склада на лендинге и в карточке склада
    // (Кирилл 26 окт: «форма устаревше выглядит»): серый фон, белые поля
    // без рамки, фокус — синим кольцом.
    <form onSubmit={submit} className="rounded-[22px] bg-[var(--wh-soft)] p-6 sm:p-8">
      <h2 className="text-[22px] font-medium tracking-tight">{t(T.formTitle)}</h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field label={t(T.fName)} name="name" required placeholder={t(T.fNamePh)} />
        <Field label={t(T.fContact)} name="contact" required placeholder="+7 900 000-00-00" />
        <div className="sm:col-span-2">
          <Field label={t(T.fCompany)} name="company" placeholder={t(T.fCompanyPh)} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="message" className="text-sm font-medium">
            {t(T.fNeed)}
          </label>
          <textarea
            id="message"
            name="message"
            rows={4}
            required
            placeholder={t(T.fNeedPh)}
            className={`${FIELD} resize-y py-3`}
          />
        </div>
      </div>

      <ConsentChecks value={consent} onChange={setConsent} className="mt-5" />

      <LeadSubmit
        lead={lead}
        idle={t(T.send)}
        blocker={consent.data ? null : t(T.consentNote)}
        type="submit"
        icon
        className="mt-5"
      />
    </form>
  );
}

function Field({
  label,
  name,
  required,
  placeholder,
}: {
  label: string;
  name: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="text-sm font-medium">
        {label}
        {required && <span className="ml-0.5 text-primary">*</span>}
      </label>
      <input
        id={name}
        name={name}
        required={required}
        placeholder={placeholder}
        className={`${FIELD} h-12`}
      />
    </div>
  );
}
