import { useEffect, useState } from "react";
import { Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import { c, useT } from "../../lib/copy";
import { RoadmapBoard } from "./RoadmapBoard";
import { RoadmapChangelog } from "./RoadmapChangelog";
import { RoadmapAsk } from "./RoadmapAsk";
import { SiteBar } from "../frame/SiteNav";
import { RoadmapAccount } from "./RoadmapAccount";
import { WarehousesFooter } from "../warehouses/WarehousesFooter";
import { RoadmapDialogs } from "./RoadmapAccount";
import { RoadmapMyIdeas } from "./RoadmapMyIdeas";
import { openDialog } from "../../lib/roadmap/store";

const T = {
  tabBoard: c("Дорожная карта", "Roadmap"),
  tabLog: c("Обновления", "Changelog"),
  tabsLabel: c("Разделы", "Sections"),
  suggest: c("Предложить идею", "Suggest an idea"),
  suggestTitle: c("Не нашли нужного?", "Missing something?"),
  suggestBody: c(
    "Опишите задачу склада, а не готовое решение. Идея появится в колонке «Обсуждаем».",
    "Describe the warehouse task, not a ready solution. The idea lands in “Discussing”.",
  ),

  title: c(
    "Выбирайте, куда развивается Уклад, и предлагайте идеи",
    "Choose where Uklad goes next and suggest ideas",
  ),
  lead: c(
    "Здесь всё, что мы обсуждаем, планируем, делаем и уже сделали. Очерёдность решают голоса складов и селлеров.",
    "Here is everything we discuss, plan, build and have shipped. The order is decided by warehouse and seller votes.",
  ),
  howTitle: c("Как участвовать", "How to take part"),
  how: [
    c(
      "Войдите в аккаунт Уклада или создайте его по почте: пароль не нужен, придёт код.",
      "Sign in with your email: no password, we send a code.",
    ),
    c(
      "Голосуйте стрелками на карточке: вверх — за, вниз — против. Голос засчитывается сразу, повторное нажатие его снимает.",
      "Vote with the arrows on a card: up for, down against. It counts at once; press again to take it back.",
    ),
    c(
      "Предлагайте своё кнопкой «Предложить идею»: опишите задачу, а не готовое решение.",
      "Suggest your own with “Suggest an idea”: describe the task, not a ready solution.",
    ),
  ],
  nextTitle: c("Что дальше", "What happens next"),
  next: c(
    "Разбираем голоса и новые идеи и переносим карточки между колонками. Срок у запланированного — квартал, а не число.",
    "We go through votes and new ideas and move cards between columns. Planned work gets a quarter, not a date.",
  ),
};

type Tab = "board" | "log";

/**
 * Дорожная карта по образцу taptop (решение 20 окт): описание слева, доска
 * справа, сверху вкладки «Дорожная карта / Обновления»; «Предложить идею» —
 * под заголовком слева.
 *
 * Страница живёт внутри обёртки `.wh` — в новом стиле витрины, токены
 * `--wh-*` из `site.css`. Данные — `data/roadmapItems.ts`; позже их будет
 * отдавать карта продукта (поле `mapNode` у пункта), и эта страница не
 * изменится.
 */
export function RoadmapScreen() {
  const t = useT();
  const [tab, setTab] = useState<Tab>("board");

  // С лендинга «Ваша функция +» ведёт сюда с #suggest: сразу открываем форму.
  useEffect(() => {
    if (window.location.hash !== "#suggest") return;
    history.replaceState(null, "", window.location.pathname + window.location.search);
    openDialog({ kind: "idea" });
  }, []);

  return (
    <div className="wh">
      <SiteBar route={{ page: "roadmap" }} extra={<RoadmapAccount />} />
      <main className="px-4 pt-8 lg:px-8">
        <nav
          aria-label={t(T.tabsLabel)}
          className="flex flex-wrap items-center gap-1 border-b border-[var(--wh-line)] pb-3"
        >
          <TabButton on={tab === "board"} onClick={() => setTab("board")} label={t(T.tabBoard)} />
          <TabButton on={tab === "log"} onClick={() => setTab("log")} label={t(T.tabLog)} />
        </nav>

        <div className="mt-8 grid gap-10 lg:grid-cols-[300px_1fr]">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <h1 className="text-2xl font-heading leading-tight tracking-tight">{t(T.title)}</h1>
            <p className="mt-3 text-sm leading-relaxed text-[var(--wh-muted)]">{t(T.lead)}</p>
            {/* Кнопка на своей плашке с пояснением, а не одна в воздухе под
                абзацем (Кирилл 31 окт). */}
            <div className="mt-5 rounded-[18px] bg-[var(--wh-soft)] p-4">
              <p className="text-sm font-medium">{t(T.suggestTitle)}</p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--wh-muted)]">
                {t(T.suggestBody)}
              </p>
              <button
                type="button"
                onClick={() => openDialog({ kind: "idea" })}
                className="wh-btn wh-btn--blue mt-3 !h-10 w-full !px-[18px] !text-sm"
              >
                <Lightbulb className="size-4" />
                {t(T.suggest)}
              </button>
            </div>

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
            <RoadmapMyIdeas />
          </aside>

          <div className="min-w-0">{tab === "board" ? <RoadmapBoard /> : <RoadmapChangelog />}</div>
        </div>
      </main>
      <RoadmapAsk />
      {/* Подвал один, тот же, что у страницы для складов: синяя форма
          перетекает в синий подвал без шва. */}
      <WarehousesFooter away />
      <RoadmapDialogs />
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
        "inline-flex h-10 items-center rounded-full px-4 text-sm font-medium transition-colors",
        on
          ? "bg-[var(--wh-soft)] text-[var(--wh-ink)]"
          : "text-[var(--wh-muted)] hover:text-[var(--wh-ink)]",
      )}
    >
      {label}
    </button>
  );
}
