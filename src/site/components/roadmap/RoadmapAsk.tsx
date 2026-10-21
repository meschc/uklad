import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROADMAP_ITEMS } from "../../data/roadmapItems";
import { MAX_VOTES, clearVotes, toggleVote, useVotes, votedItems } from "../../lib/roadmapVotes";
import { c, useT, type Copy } from "../../lib/copy";
import { useLeadSend } from "../../lib/useLeadSend";
import { ConsentChecks, type ConsentState } from "../ConsentChecks";
import { LeadSubmit } from "../LeadSubmit";
import { Reveal } from "../Reveal";

/**
 * Форма внизу дорожной карты: отправить отметки и предложить своё.
 *
 * Раньше на этом месте стояла ссылка «Написать нам» на страницу контактов. Путь
 * из четырёх шагов — уйти со страницы, найти поле, вспомнить, что хотел
 * сказать, — и идея оставалась ненаписанной. Форма стоит прямо здесь, ровно под
 * доской, и отмеченные пункты в неё уже подставлены.
 *
 * Обязательного поля тут нет ни одного: можно отправить только отметки, можно
 * только идею, можно и то и другое. Требуется единственное — согласие на
 * обработку данных, и то лишь потому, что без него отправлять нельзя по закону
 * (см. `server/leads/lead.js`).
 *
 * Отметки после отправки не стираются сами. Человек их ставил, ему и снимать:
 * молча очистить доску значило бы сказать «всё, забыли» за него. Кнопка «снять
 * все» рядом со списком — на случай, когда именно это и нужно.
 */

/** Предел длины идеи. Письмо, а не документ: на приёмнике поле обрезано 2000. */
const MAX_IDEA = 1_000;

/** Адрес или телефон — строка, а не анкета. */
const MAX_CONTACT = 120;

const T = {
  title: c("Чего не хватает?", "What is missing?"),
  note: c(
    "Отметьте на доске то, что нужно вам раньше прочего, и расскажите, чего в списке нет вовсе. Это единственный способ передать нам голос: страница статическая, и отметки до отправки лежат только в вашем браузере.",
    "Mark on the board what you need first, and tell us what the list is missing entirely. This is the only way your vote reaches us: the page is static, and until you send them the marks live in your browser alone.",
  ),

  marked: c("Отмечено: {count} из {max}", "Marked: {count} of {max}"),
  markedEmpty: c(
    "Пока ничего не отмечено — можно просто написать свою идею.",
    "Nothing marked yet — you can just write your idea.",
  ),
  unmark: c("Снять отметку с «{title}»", "Unmark “{title}”"),
  clear: c("Снять все", "Clear all"),

  idea: c("Своя идея", "Your idea"),
  ideaPlaceholder: c(
    "Чего не хватает именно вашему складу и как вы это делаете сейчас",
    "What your warehouse is missing, and how you handle it today",
  ),
  contact: c("Куда ответить", "Where to reply"),
  contactPlaceholder: c("Почта или телефон — необязательно", "Email or phone — optional"),

  submit: c("Отправить", "Send"),
  subjectVotes: c("Голоса за дорожную карту", "Votes for the roadmap"),
  subjectIdea: c("Идея для дорожной карты", "An idea for the roadmap"),

  fVotes: c("Отмеченные пункты", "Marked items"),
  fIdea: c("Идея", "Idea"),
  fContact: c("Контакт", "Contact"),

  gapEmpty: c(
    "Отметьте хотя бы один пункт на доске или напишите свою идею.",
    "Mark at least one item on the board or write your idea.",
  ),
  gapConsent: c("Отметьте согласие на обработку данных.", "Tick the consent to data processing."),
};

export function RoadmapAsk() {
  const t = useT();
  const votes = useVotes();
  const [idea, setIdea] = useState("");
  const [contact, setContact] = useState("");
  const [consent, setConsent] = useState<ConsentState>({ data: false, ads: false });
  const lead = useLeadSend();

  // Отмеченное перечисляется в порядке доски, а не нажатий: в письме это
  // читается как выдержка из карты, а не как история кликов.
  const marked = votedItems(ROADMAP_ITEMS, votes);
  const text = idea.trim();

  const blocker: Copy | null =
    text === "" && marked.length === 0 ? T.gapEmpty : consent.data ? null : T.gapConsent;

  const done = lead.state === "sent" || lead.state === "mailed";

  const [tried, setTried] = useState(false);

  const send = () => {
    if (blocker) {
      setTried(true);
      return;
    }
    lead.send({
      // Вид заявки — по тому, что в ней главное. Письмо с идеей читают отдельно
      // и отвечают на него; голоса складывают пачкой, когда решают очерёдность.
      kind: text === "" ? "vote" : "idea",
      lang: t.lang,
      subject: t(text === "" ? T.subjectVotes : T.subjectIdea),
      fields: [
        { label: t(T.fVotes), value: marked.map((item) => t(item.title)).join("; ") },
        { label: t(T.fIdea), value: text },
        { label: t(T.fContact), value: contact.trim() },
      ],
      consent,
    });
  };

  return (
    <section
      id="ideas"
      className="mt-24 scroll-mt-20 rounded-t-[24px] bg-[var(--wh-blue)] text-white sm:rounded-t-[32px]"
    >
      <div className="mx-auto max-w-[1280px] px-5 pb-16 pt-16 sm:px-10 sm:pt-24">
        <div className="grid grid-cols-1 gap-14 lg:grid-cols-2 lg:gap-20">
          <Reveal>
            <h2 className="text-[clamp(40px,5vw,72px)] font-normal leading-[0.98] tracking-[-0.045em]">
              {t(T.title)}
            </h2>
            <p className="mt-6 max-w-[34rem] text-[17px] leading-relaxed text-white/80">
              {t(T.note)}
            </p>
          </Reveal>

          <Reveal
            delay={120}
            className="min-w-0 overflow-hidden rounded-[22px] bg-background px-5 py-7 text-foreground sm:px-8"
          >
            {!done && (
              <div className="flex flex-col gap-4">
                <MarkedList items={marked} />

                <div>
                  <label htmlFor="roadmap-idea" className="text-sm font-medium">
                    {t(T.idea)}
                  </label>
                  <textarea
                    id="roadmap-idea"
                    value={idea}
                    rows={4}
                    maxLength={MAX_IDEA}
                    placeholder={t(T.ideaPlaceholder)}
                    onChange={(e) => setIdea(e.target.value)}
                    className="mt-1.5 w-full resize-y rounded-xl border border-border bg-background px-4 py-3 text-base leading-relaxed outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-[var(--wh-blue)]"
                  />
                </div>

                <div>
                  <label htmlFor="roadmap-contact" className="text-sm font-medium">
                    {t(T.contact)}
                  </label>
                  <input
                    id="roadmap-contact"
                    value={contact}
                    maxLength={MAX_CONTACT}
                    placeholder={t(T.contactPlaceholder)}
                    onChange={(e) => setContact(e.target.value)}
                    className="mt-1.5 h-12 w-full rounded-xl border border-border bg-background px-4 text-base outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-[var(--wh-blue)]"
                  />
                </div>

                <ConsentChecks value={consent} onChange={setConsent} />
              </div>
            )}

            <LeadSubmit lead={lead} idle={t(T.submit)} onClick={send} icon className="mt-5" />
            {/* Подсказка — только после попытки отправить и под кнопкой, как
                в заявке складов (Кирилл, 19 окт): заранее она читается упрёком. */}
            {tried && blocker && (
              <p role="alert" className="mt-2 text-xs leading-relaxed text-destructive">
                {t(blocker)}
              </p>
            )}
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/**
 * Отмеченное списком — с крестиком у каждого пункта.
 *
 * Снять отметку должно быть можно отсюда, не возвращаясь к доске: список из
 * десяти строк и есть то место, где человек замечает лишнее.
 */
function MarkedList({ items }: { items: readonly { id: string; title: Copy }[] }) {
  const t = useT();

  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">{t(T.markedEmpty)}</p>;
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          <span className="tabular-nums">
            {t(T.marked, { count: items.length, max: MAX_VOTES })}
          </span>
        </p>
        <button
          type="button"
          onClick={clearVotes}
          className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          {t(T.clear)}
        </button>
      </div>

      <ul className="mt-2 flex flex-wrap gap-2">
        {items.map((item) => {
          const title = t(item.title);
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => toggleVote(item.id)}
                aria-label={t(T.unmark, { title })}
                className={cn(
                  "r-chip inline-flex h-8 items-center gap-1.5 bg-[var(--wh-soft)] shadow-[inset_0_0_0_1px_var(--wh-line)]",
                  "px-3 text-xs text-foreground transition-colors hover:bg-[var(--wh-line)]",
                )}
              >
                {title}
                <X className="size-3 text-muted-foreground" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
