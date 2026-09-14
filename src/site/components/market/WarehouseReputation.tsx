import { useState } from "react";
import { AlertTriangle, MessageSquare, Star } from "lucide-react";
import { Block } from "./Block";
import { ConsentChecks, type ConsentState } from "../ConsentChecks";
import { LeadSubmit } from "../LeadSubmit";
import type { Complaint, Review } from "../../data/deals";
import type { Warehouse } from "../../data/warehouses";
import { warehousesRepository } from "../../data/warehousesRepository";
import { c, useT, type TFunc } from "../../lib/copy";
import { PAGE_NOW, daysSince, shortDate } from "../../lib/date";
import { COMPLAINT_ANSWER_DAYS, isComplaintOpen } from "../../lib/reputation";
import { MAX_TEXT } from "../../lib/request";
import { useLeadSend } from "../../lib/useLeadSend";

/**
 * Отзывы и жалобы на странице склада.
 *
 * Здесь видно главное решение витрины про репутацию: отзыв — это факт сделки,
 * а не оценка настроения. Право написать его даёт только сделка, подтверждённая
 * обеими сторонами, поэтому отзывов мало — и это правильное состояние рынка,
 * который начинается. Пять звёзд по двумстам отзывам у каждого второго склада
 * означали бы ровно обратное: что их никто не проверял.
 *
 * Жалоба живёт на виду до публичного ответа, и это вся механика: платформа не
 * разбирает спор об упаковке — мы не видели ни коробки, ни товара, — но
 * молчание склада видно достоверно. Через `COMPLAINT_ANSWER_DAYS` жалоба
 * считается подтверждённой, две подтверждённые за квартал убирают склад из
 * верха выдачи (`lib/reputation`). Об этом сказано тут же, рядом с жалобами:
 * правило, о котором не объявлено, работает как произвол.
 */

const T = {
  title: c("Отзывы и жалобы", "Reviews and complaints"),
  rule: c(
    "Отзыв здесь может оставить только тот, чью сделку подтвердили обе стороны — и селлер, и склад. Поэтому отзывов немного: каждый из них — закрытая поставка, а не мнение со стороны.",
    "Only someone whose deal both sides confirmed — the seller and the warehouse — can leave a review here. That is why there are few: each one is a closed delivery, not an opinion from the sidelines.",
  ),
  empty: c(
    "С этим складом через Уклад ещё не работали: ни отзывов, ни жалоб. Это не хорошо и не плохо — про него просто пока ничего не известно.",
    "Nobody has worked with this warehouse through Uklad yet: no reviews, no complaints. That is neither good nor bad — there is simply nothing known about it yet.",
  ),
  seller: c("Селлер {id}", "Seller {id}"),
  rating: c("Оценка {n} из 5", "Rated {n} out of 5"),
  complaintsTitle: c("Жалобы", "Complaints"),
  answered: c("Ответ склада", "The warehouse answers"),
  silent: c("Склад не ответил, {n} {word}", "No answer for {n} {word}"),
  confirmed: c(
    "Жалоба подтверждена: ответа не было дольше {n} дней.",
    "Complaint confirmed: no answer for over {n} days.",
  ),
  demoted: c(
    "Склад убран из верха выдачи: {n} подтверждённых жалобы за квартал.",
    "This warehouse is out of the top results: {n} confirmed complaints this quarter.",
  ),
  howTitle: c("Как это работает", "How this works"),
  how: c(
    "Уклад не судит, кто прав: мы не видели ни товара, ни упаковки. Мы видим другое — ответил склад публично или промолчал. Ответа нет дольше {n} дней — жалоба считается подтверждённой, две подтверждённые за квартал убирают склад из верха выдачи.",
    "Uklad does not judge who is right: we saw neither the goods nor the packing. We see something else — whether the warehouse answered in public or kept quiet. No answer for over {n} days makes a complaint confirmed, and two confirmed ones in a quarter take the warehouse out of the top results.",
  ),
  open: c("Пожаловаться на склад", "File a complaint"),
  cancel: c("Не надо", "Never mind"),
  formNote: c(
    "Жалоба публикуется на этой странице вместе с ответом склада. Поэтому нужен номер сделки: без него это отзыв постороннего, а за такими мы и пришли на этот рынок.",
    "The complaint is published on this page together with the warehouse’s answer. That is why the deal number is required: without it this is a bystander’s opinion, the very thing we came to this market to fix.",
  ),
  deal: c("Номер сделки", "Deal number"),
  dealPlaceholder: c("w-12-d3", "w-12-d3"),
  what: c("Что случилось", "What happened"),
  whatPlaceholder: c(
    "Коротко и по фактам: что было в договоре и что вышло на деле.",
    "Short and factual: what the contract said and what actually happened.",
  ),
  send: c("Отправить жалобу", "Send the complaint"),
  subject: c("Жалоба на склад {name}", "Complaint about {name}"),
  gaps: {
    deal: c("Укажите номер сделки — жалоба без сделки не публикуется.", "Enter the deal number."),
    what: c("Опишите, что случилось.", "Describe what happened."),
    consent: c("Отметьте согласие на обработку данных.", "Tick the consent to data processing."),
  },
};

const DAYS: [string, string, string] = ["день", "дня", "дней"];
const DAYS_EN: [string, string] = ["day", "days"];

export function WarehouseReputation({ warehouse: w }: { warehouse: Warehouse }) {
  const t = useT();
  const reviews = warehousesRepository.reviews(w.id);
  const complaints = warehousesRepository.complaints(w.id);
  // Одно время на весь блок — снимок загрузки страницы (`lib/date`): две жалобы,
  // посчитанные по разным вызовам часов, разъедутся на сутки на полуночи.
  const now = PAGE_NOW;
  const nothing = reviews.length === 0 && complaints.length === 0;

  return (
    <Block title={t(T.title)}>
      <p className="text-[12px] leading-relaxed text-muted-foreground">{t(T.rule)}</p>

      {nothing ? (
        <p className="mt-3 text-[13px] leading-relaxed">{t(T.empty)}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {reviews.map((review) => (
            <li key={review.id}>
              <ReviewCard review={review} t={t} />
            </li>
          ))}
        </ul>
      )}

      {complaints.length > 0 && (
        <>
          <h3 className="mb-3 mt-7 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t(T.complaintsTitle)}
          </h3>
          {w.reputation.demoted && (
            <p className="mb-3 flex items-start gap-2 text-[12px] font-medium leading-relaxed text-amber-600 dark:text-amber-500">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {t(T.demoted, { n: w.reputation.confirmedComplaints })}
            </p>
          )}
          <ul className="flex flex-col gap-3">
            {complaints.map((complaint) => (
              <li key={complaint.id}>
                <ComplaintCard complaint={complaint} now={now} t={t} />
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">{t(T.howTitle)}. </span>
        {t(T.how, { n: COMPLAINT_ANSWER_DAYS })}
      </p>

      <ComplaintForm warehouse={w} />
    </Block>
  );
}

/** Отзыв: оценка, дата, автор — и текст, ради которого его открывают. */
function ReviewCard({ review, t }: { review: Review; t: TFunc }) {
  return (
    <article className="r-inset border border-border p-4">
      <header className="flex items-center justify-between gap-3">
        <span
          className="flex items-center gap-0.5"
          aria-label={t(T.rating, { n: review.rating })}
          title={t(T.rating, { n: review.rating })}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              aria-hidden
              className={
                n <= review.rating
                  ? "size-3.5 fill-amber-400 text-amber-400"
                  : "size-3.5 text-border"
              }
            />
          ))}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {t(T.seller, { id: review.authorId })} · {shortDate(t.lang, review.createdAt)}
        </span>
      </header>
      <p className="mt-2 text-[13px] leading-relaxed">{t(review.text)}</p>
    </article>
  );
}

/**
 * Жалоба и то, что с ней стало.
 *
 * Ответ склада стоит под жалобой, а не вместо неё: спор остаётся виден целиком,
 * и читатель сам решает, чей довод весит больше. Неотвеченная жалоба считает
 * дни вслух — это единственное давление, которое у платформы есть.
 */
function ComplaintCard({ complaint, now, t }: { complaint: Complaint; now: number; t: TFunc }) {
  const open = isComplaintOpen(complaint);
  const days = daysSince(complaint.createdAt, now);
  const confirmed = open && days > COMPLAINT_ANSWER_DAYS;

  return (
    <article
      className={`r-inset border p-4 ${confirmed ? "border-amber-500/50" : "border-border"}`}
    >
      <header className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-[12px] font-medium">
          <AlertTriangle className="size-3.5 shrink-0 text-amber-600 dark:text-amber-500" />
          {t(T.seller, { id: complaint.authorId })}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {shortDate(t.lang, complaint.createdAt)}
        </span>
      </header>
      <p className="mt-2 text-[13px] leading-relaxed">{t(complaint.text)}</p>

      {complaint.answer ? (
        <div className="mt-3 border-l-2 border-primary/40 pl-3">
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-primary">
            <MessageSquare className="size-3" />
            {t(T.answered)} · {shortDate(t.lang, complaint.answeredAt ?? complaint.createdAt)}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {t(complaint.answer)}
          </p>
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {t(T.silent, { n: days, word: t.plural(days, DAYS, DAYS_EN) })}
          {confirmed && ` — ${t(T.confirmed, { n: COMPLAINT_ANSWER_DAYS })}`}
        </p>
      )}
    </article>
  );
}

/**
 * Форма жалобы.
 *
 * Свёрнута до нажатия намеренно: развёрнутое поле «что случилось» под отзывами
 * читается как приглашение пожаловаться, а мы приглашаем работать. Уходит тем
 * же швом, что и заявка (`lib/leads`), только под своим видом — приёмник
 * раскладывает письма по `kind`, и жалоба не должна попадать в очередь заявок.
 */
function ComplaintForm({ warehouse: w }: { warehouse: Warehouse }) {
  const t = useT();
  const [shown, setShown] = useState(false);
  const [deal, setDeal] = useState("");
  const [what, setWhat] = useState("");
  const [consent, setConsent] = useState<ConsentState>({ data: false, ads: false });
  const lead = useLeadSend();

  const blocker = !deal.trim()
    ? T.gaps.deal
    : !what.trim()
      ? T.gaps.what
      : !consent.data
        ? T.gaps.consent
        : null;

  const send = () => {
    if (blocker) return;
    lead.send({
      kind: "complaint",
      lang: t.lang,
      subject: t(T.subject, { name: t(w.name) }),
      fields: [
        { label: t(T.deal), value: deal },
        { label: t(T.what), value: what },
      ],
      consent,
    });
  };

  if (!shown) {
    return (
      <button
        type="button"
        onClick={() => setShown(true)}
        className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:border-amber-500/60 hover:text-foreground"
      >
        <AlertTriangle className="size-3.5" />
        {t(T.open)}
      </button>
    );
  }

  const done = lead.state === "sent" || lead.state === "mailed";

  return (
    <div className="r-window mt-4 border border-border bg-card p-4 sm:p-5">
      <p className="text-sm font-medium">{t(T.open)}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{t(T.formNote)}</p>

      {!done && (
        <div className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="complaint-deal"
              className="block text-[11px] uppercase tracking-wide text-muted-foreground"
            >
              {t(T.deal)}
            </label>
            <input
              id="complaint-deal"
              value={deal}
              placeholder={t(T.dealPlaceholder)}
              maxLength={MAX_TEXT}
              onChange={(e) => setDeal(e.target.value)}
              className="mt-1.5 h-10 w-full rounded-full border border-border bg-background px-3.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary"
            />
          </div>

          <div>
            <label
              htmlFor="complaint-what"
              className="block text-[11px] uppercase tracking-wide text-muted-foreground"
            >
              {t(T.what)}
            </label>
            <textarea
              id="complaint-what"
              rows={4}
              value={what}
              placeholder={t(T.whatPlaceholder)}
              maxLength={MAX_TEXT}
              onChange={(e) => setWhat(e.target.value)}
              className="r-inset mt-1.5 w-full resize-y border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary"
            />
          </div>

          <ConsentChecks value={consent} onChange={setConsent} />
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <LeadSubmit
          lead={lead}
          idle={t(T.send)}
          blocker={blocker ? t(blocker) : null}
          onClick={send}
        />
        {!done && (
          <button
            type="button"
            onClick={() => setShown(false)}
            className="shrink-0 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
          >
            {t(T.cancel)}
          </button>
        )}
      </div>
    </div>
  );
}
