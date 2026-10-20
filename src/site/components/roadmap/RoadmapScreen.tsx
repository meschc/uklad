import { useState } from "react";
import { Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import { c, useT } from "../../lib/copy";
import { RoadmapBoard } from "./RoadmapBoard";
import { RoadmapChangelog } from "./RoadmapChangelog";
import { RoadmapAsk } from "./RoadmapAsk";

const T = {
  tabBoard: c("Дорожная карта", "Roadmap"),
  tabLog: c("Обновления", "Changelog"),
  tabsLabel: c("Разделы", "Sections"),
  suggest: c("Предложить идею", "Suggest an idea"),

  title: c("Помогите решить, что Уклад сделает дальше", "Help decide what Uklad builds next"),
  lead: c(
    "Здесь всё, что мы обсуждаем, планируем, делаем и уже сделали. Очерёдность решают голоса складов и селлеров.",
    "Here is everything we discuss, plan, build and have shipped. The order is decided by warehouse and seller votes.",
  ),
  howTitle: c("Как участвовать", "How to take part"),
  how: [
    c(
      "Голосуйте за то, что нужно вам раньше прочего. До 10 голосов.",
      "Vote for what you need first. Up to 10 votes.",
    ),
    c(
      "Предлагайте своё в форме внизу: опишите задачу, а не готовое решение.",
      "Suggest your own in the form below: describe the task, not a ready solution.",
    ),
    c(
      "Оставьте почту или телефон, если хотите обсудить идею с нами.",
      "Leave an email or phone if you want to discuss the idea with us.",
    ),
  ],
  nextTitle: c("Что дальше", "What happens next"),
  next: c(
    "Раз в неделю разбираем голоса и новые идеи и переносим карточки между колонками. Срок у запланированного — квартал, а не число.",
    "Once a week we go through votes and new ideas and move cards between columns. Planned work gets a quarter, not a date.",
  ),
};

type Tab = "board" | "log";

/**
 * Дорожная карта по образцу taptop (решение 20 окт): описание слева, доска
 * справа, сверху вкладки «Дорожная карта / Обновления» и «Предложить идею».
 *
 * Страница живёт внутри обёртки `.wh` — в новом стиле витрины, токены
 * `--wh-*` из `site.css`. Данные — `data/roadmapItems.ts`; позже их будет
 * отдавать карта продукта (поле `mapNode` у пункта), и эта страница не
 * изменится.
 */
export function RoadmapScreen() {
  const t = useT();
  const [tab, setTab] = useState<Tab>("board");

  return (
    <div className="wh">
      <div className="mx-auto max-w-[1440px] px-4 pb-24 pt-24 sm:px-6 sm:pt-28">
        <nav
          aria-label={t(T.tabsLabel)}
          className="flex flex-wrap items-center gap-1 border-b border-[var(--wh-line)] pb-3"
        >
          <TabButton on={tab === "board"} onClick={() => setTab("board")} label={t(T.tabBoard)} />
          <TabButton on={tab === "log"} onClick={() => setTab("log")} label={t(T.tabLog)} />
          <a
            href="#ideas"
            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full bg-[var(--wh-blue)] px-4 text-sm font-medium text-[var(--wh-on-blue)] transition-colors hover:bg-[var(--wh-blue-deep)]"
          >
            <Lightbulb className="size-4" />
            {t(T.suggest)}
          </a>
        </nav>

        <div className="mt-8 grid gap-10 lg:grid-cols-[300px_1fr]">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <h1 className="text-2xl font-heading leading-tight tracking-tight">{t(T.title)}</h1>
            <p className="mt-3 text-sm leading-relaxed text-[var(--wh-muted)]">{t(T.lead)}</p>

            <h2 className="mt-6 text-sm font-heading">{t(T.howTitle)}</h2>
            <ul className="mt-2 space-y-2 text-sm leading-relaxed text-[var(--wh-muted)]">
              {T.how.map((line, index) => (
                <li key={index} className="flex gap-2">
                  <span className="tabular-nums text-[var(--wh-blue)]">{index + 1}</span>
                  {t(line)}
                </li>
              ))}
            </ul>

            <h2 className="mt-6 text-sm font-heading">{t(T.nextTitle)}</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--wh-muted)]">{t(T.next)}</p>
          </aside>

          <div className="min-w-0">{tab === "board" ? <RoadmapBoard /> : <RoadmapChangelog />}</div>
        </div>

        <RoadmapAsk />
      </div>
    </div>
  );
}

function TabButton({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "inline-flex h-9 items-center rounded-full px-4 text-sm font-medium transition-colors",
        on
          ? "bg-[var(--wh-soft)] text-[var(--wh-ink)]"
          : "text-[var(--wh-muted)] hover:text-[var(--wh-ink)]",
      )}
    >
      {label}
    </button>
  );
}
