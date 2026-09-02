import { useState } from "react";
import { AtSign, Building2, Clock, Phone, Send, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { ORG } from "../data/org";
import { go } from "../lib/route";
import { ConsentChecks, type ConsentState } from "./ConsentChecks";
import { Reveal } from "./Reveal";

/**
 * Контакты.
 *
 * Кроме формы — обязательное раскрытие: наименование, адрес, почта и режим
 * работы требуются ч. 2 ст. 10 149-ФЗ и ст. 9 закона «О защите прав
 * потребителей». Печатаются из того же `ORG`, что и правовые страницы, чтобы
 * не разъехались.
 */
export function ContactsScreen() {
  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-28 sm:px-6 sm:pt-32">
      <h1 className="font-display text-[30px] font-medium leading-[1.05] tracking-[-0.02em] sm:text-[40px]">
        Контакты
      </h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
        Напишите — ответим в рабочие часы. Вопросы про склад, интеграцию или
        перенос остатков лучше сразу с деталями: сколько позиций, куда отгружаете
        и что не устраивает в текущем учёте.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Reveal>
          <ContactForm />
        </Reveal>

        <Reveal delay={90} className="flex flex-col gap-4">
          <Card icon={AtSign} title="Почта">
            <a
              href={`mailto:${ORG.email}`}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {ORG.email}
            </a>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Общие вопросы, партнёрство, подключение склада.
            </p>
          </Card>

          <Card icon={ShieldCheck} title="Персональные данные">
            <a
              href={`mailto:${ORG.privacyEmail}`}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {ORG.privacyEmail}
            </a>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Запросы об обработке, отзыв согласия, удаление данных. Ответ — за
              десять рабочих дней.
            </p>
          </Card>

          <Card icon={Phone} title="Телефон">
            <span className="font-medium tabular-nums">{ORG.phone}</span>
            <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <Clock className="size-3.5" />
              {ORG.hours}
            </p>
          </Card>

          <Card icon={Building2} title="Реквизиты">
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {ORG.legalName}
              <br />
              ИНН {ORG.inn}, ОГРН {ORG.ogrn}
              <br />
              {ORG.address}
            </p>
            <button
              onClick={() => go("/legal/requisites")}
              className="mt-2 text-[13px] font-medium text-primary underline-offset-4 hover:underline"
            >
              Полное раскрытие
            </button>
          </Card>
        </Reveal>
      </div>
    </div>
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
    <div className="r-window border border-border bg-card p-5">
      <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" />
        {title}
      </p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

const EMPTY_CONSENT: ConsentState = { data: false, ads: false };

function ContactForm() {
  const [consent, setConsent] = useState<ConsentState>(EMPTY_CONSENT);
  const [sent, setSent] = useState(false);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSent(true);
      }}
      className="r-window border border-border bg-card p-6 sm:p-7"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Как к вам обращаться" name="name" required placeholder="Имя" />
        <Field label="Телефон или почта" name="contact" required placeholder="+7 900 000-00-00" />
        <div className="sm:col-span-2">
          <Field label="Компания" name="company" placeholder="ООО или ИП, необязательно" />
        </div>
        <div className="sm:col-span-2">
          <label className="text-[13px] font-medium">Что нужно</label>
          <textarea
            name="message"
            rows={4}
            required
            placeholder="Например: 1 200 SKU, отгружаем на Wildberries и Ozon, ищем склад в Подмосковье"
            className="r-inset mt-1.5 w-full resize-y border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary"
          />
        </div>
      </div>

      <ConsentChecks value={consent} onChange={setConsent} className="mt-5" />

      <button
        type="submit"
        disabled={!consent.data || sent}
        className={cn(
          "mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full px-5 text-sm font-medium transition-colors",
          sent
            ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
            : "bg-primary text-primary-foreground enabled:hover:bg-primary/90 disabled:opacity-45",
        )}
      >
        {!sent && <Send className="size-4" />}
        {sent ? "Отправлено" : "Отправить"}
      </button>

      <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
        {sent
          ? `Форма пока не отправляет письма — напишите напрямую на ${ORG.email}, отвечаем в рабочие часы.`
          : "Кнопка активна только после согласия на обработку данных — заранее проставленная галочка согласием не считается."}
      </p>
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
      <label htmlFor={name} className="text-[13px] font-medium">
        {label}
        {required && <span className="ml-0.5 text-primary">*</span>}
      </label>
      <input
        id={name}
        name={name}
        required={required}
        placeholder={placeholder}
        className="mt-1.5 h-11 w-full rounded-full border border-border bg-background px-4 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary"
      />
    </div>
  );
}
