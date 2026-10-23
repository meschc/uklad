import { Lightbulb } from "lucide-react";
import { ru, useT } from "../../lib/copy";
import { openDialog } from "../../lib/roadmap/store";
import { Reveal } from "../Reveal";

const T = {
  title: ru("Чего не хватает?"),
  note: ru(
    "Не нашли нужного на доске? Опишите задачу своими словами. Разберём за неделю и напишем, если возьмём в работу.",
  ),
  suggest: ru("Предложить идею"),
};

/**
 * Синий финал страницы в стиле лендинга складов. Раньше здесь стояла форма
 * «отметки + идея + контакт»; теперь голос засчитывается на карточке, а
 * идея подаётся отдельным окном (Кирилл, 21 окт), так что блоку остаётся
 * один призыв.
 */
export function RoadmapAsk() {
  const t = useT();
  return (
    <section
      id="ideas"
      className="mt-24 scroll-mt-20 rounded-t-[24px] bg-[var(--wh-blue)] text-white sm:rounded-t-[32px]"
    >
      <div className="mx-auto max-w-[1280px] px-5 pb-16 pt-16 sm:px-10 sm:pt-24">
        <Reveal className="flex flex-col items-start gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-[clamp(40px,5vw,72px)] font-normal leading-[0.98] tracking-[-0.045em]">
              {t(T.title)}
            </h2>
            <p className="mt-6 max-w-[34rem] text-[17px] leading-relaxed text-white/80">
              {t(T.note)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => openDialog({ kind: "idea" })}
            className="inline-flex h-14 shrink-0 items-center gap-2 rounded-full bg-white px-7 text-base font-medium text-[var(--wh-blue)] transition-transform hover:-translate-y-0.5"
          >
            <Lightbulb className="size-5" />
            {t(T.suggest)}
          </button>
        </Reveal>
      </div>
    </section>
  );
}
