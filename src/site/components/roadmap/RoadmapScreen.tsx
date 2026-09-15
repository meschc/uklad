import { ArrowRight } from "lucide-react";
import { RELEASES } from "../../data/roadmap";
import { ROADMAP_ITEMS } from "../../data/roadmapItems";
import { countByStatus } from "../../lib/roadmapStats";
import { shortDate } from "../../lib/date";
import { href } from "../../lib/route";
import { c, useT } from "../../lib/copy";
import { eyebrow as eyebrowClass } from "../../lib/eyebrow";
import { Reveal } from "../Reveal";
import { RoadmapMilestones } from "./RoadmapMilestones";
import { RoadmapBoard } from "./RoadmapBoard";
import { RoadmapChangelog } from "./RoadmapChangelog";

const T = {
  eyebrow: c("Дорожная карта", "Roadmap"),
  title: c("Что уже работает и что будет дальше", "What works today and what comes next"),
  lead: c(
    "Уклад делается на виду: здесь полный список того, что сделано, что пишется прямо сейчас и что только решено делать. Сроки у запланированного — ориентир по кварталу, а не обещание к числу; у идей сроков нет вовсе, и это честнее, чем поставить их для вида.",
    "Uklad is built in the open: here is the full list of what is done, what is being written right now and what has only been decided. Dates on planned work are a quarter-level guide, not a promise for a given day; ideas carry no dates at all, which is more honest than inventing them.",
  ),
  updated: c("Последний выпуск — {date}", "Latest release — {date}"),

  statDone: c("работает", "working"),
  statProgress: c("в работе", "in progress"),
  statAhead: c("впереди", "ahead"),

  milestonesEyebrow: c("Этапы", "Milestones"),
  milestonesTitle: c("Куда движемся", "Where this is heading"),
  milestonesNote: c(
    "Крупные этапы: каждый имеет смысл только целиком, отдельными пунктами они клиенту ничего не дают.",
    "The big stages: each one only makes sense whole — taken apart, the items give the client nothing.",
  ),

  boardEyebrow: c("Все работы", "Everything"),
  boardTitle: c("Доска по стадиям", "The board, by stage"),
  boardNote: c(
    "Отберите по направлению, если интересует что-то одно.",
    "Filter by area if you only care about one of them.",
  ),

  logEyebrow: c("Журнал", "Changelog"),
  logTitle: c("Что выходило", "What has shipped"),
  logNote: c(
    "Тот же список, что в CHANGELOG.md репозитория: один источник, чтобы страница не разошлась с кодом.",
    "The same list as the repository's CHANGELOG.md: one source, so the page cannot drift from the code.",
  ),

  askTitle: c("Не хватает чего-то важного?", "Missing something important?"),
  askNote: c(
    "Напишите, чего не хватает именно вашему складу. Мы не показываем голоса за пункты: пользователей у Уклада пока единицы, и любая цифра рядом с идеей была бы нарисованной. А письмо от живого склада меняет очерёдность по-настоящему.",
    "Tell us what your warehouse is missing. We do not show vote counts on items: Uklad has a handful of users so far, and any number next to an idea would be made up. A letter from a real warehouse changes the order for real.",
  ),
  askCta: c("Написать нам", "Write to us"),
};

/**
 * Дорожная карта — страница витрины, а не отдельное приложение.
 *
 * Тем же путём, что и «Тарифы»: один адрес в реестре, пререндер и карта сайта
 * достаются даром, ссылка живёт в подвале, палитра берётся из `site.css`.
 * Отдельная сборка под одну страницу означала бы вторую систему, которую надо
 * собирать, выкладывать и держать в курсе изменений — и которую забудут
 * выложить первой же правкой.
 *
 * Порядок блоков: сводка → этапы → доска → журнал. Сверху ответ для того, кто
 * заглянул на минуту, ниже — для того, кто выбирает систему всерьёз.
 */
export function RoadmapScreen() {
  const t = useT();
  const counts = countByStatus(ROADMAP_ITEMS);
  const latest = RELEASES[0];

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-28 sm:px-6 sm:pt-32">
      <div className="text-center">
        <p className={eyebrowClass("mb-3")}>{t(T.eyebrow)}</p>
        <h1 className="font-display text-[30px] font-medium leading-[1.05] tracking-[-0.02em] sm:text-[44px]">
          {t(T.title)}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-[17px]">
          {t(T.lead)}
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-x-10 gap-y-5">
          <Stat value={counts.done} label={t(T.statDone)} />
          <Stat value={counts.progress} label={t(T.statProgress)} />
          <Stat value={counts.planned + counts.idea} label={t(T.statAhead)} />
        </div>

        {latest && (
          <p className="mt-6 text-[12px] tabular-nums text-muted-foreground">
            {t(T.updated, {
              date: shortDate(t.lang, Date.parse(`${latest.date}T12:00:00Z`)),
            })}
          </p>
        )}
      </div>

      <section className="mt-16 sm:mt-20">
        <SectionLabel
          eyebrow={t(T.milestonesEyebrow)}
          title={t(T.milestonesTitle)}
          note={t(T.milestonesNote)}
        />
        <div className="mt-8">
          <RoadmapMilestones />
        </div>
      </section>

      <hr className="beam my-16 sm:my-20" />

      <section>
        <SectionLabel eyebrow={t(T.boardEyebrow)} title={t(T.boardTitle)} note={t(T.boardNote)} />
        <div className="mt-8">
          <RoadmapBoard />
        </div>
      </section>

      <hr className="beam my-16 sm:my-20" />

      <section>
        <SectionLabel eyebrow={t(T.logEyebrow)} title={t(T.logTitle)} note={t(T.logNote)} />
        <div className="mt-8">
          <RoadmapChangelog />
        </div>
      </section>

      <Reveal className="r-window mt-16 border border-border bg-card/60 p-6 text-center sm:mt-20 sm:p-8">
        <h2 className="font-display text-[20px] font-medium tracking-tight">{t(T.askTitle)}</h2>
        <p className="mx-auto mt-3 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
          {t(T.askNote)}
        </p>
        <a
          href={href("/contacts")}
          className="group mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {t(T.askCta)}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </a>
      </Reveal>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <p className="flex flex-col items-center">
      <span className="font-display text-[30px] font-medium tabular-nums leading-none tracking-tight">
        {value}
      </span>
      <span className="mt-1.5 text-[12px] text-muted-foreground">{label}</span>
    </p>
  );
}

function SectionLabel({ eyebrow, title, note }: { eyebrow: string; title: string; note: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className={eyebrowClass()}>{eyebrow}</p>
      <h2 className="mt-2 font-display text-[22px] font-medium tracking-tight sm:text-[26px]">
        {title}
      </h2>
      <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">{note}</p>
    </div>
  );
}
