import { cn } from "@/lib/utils";
import { Reveal } from "../Reveal";
import { ru, useT, type Copy } from "../../lib/copy";
import { href } from "../../lib/route";

const T = {
  title: ru("Система, настроенная под ваш склад"),
  sub: ru("Условия тестового периода для первых складов."),
  roadmapTitle: ru("Открытая дорожная карта"),
  roadmapBody: ru(
    "Что предложили склады, что в работе и что уже работает, видно на одной странице. Ваши функции появляются там же.",
  ),
  roadmapLink: ru("Дорожная карта →"),
};

/** Условия, которые склад сравнивает первыми, — крупным числом. */
const NUMBERS: { value: string; unit: Copy; body: Copy }[] = [
  {
    value: "3",
    unit: ru("месяца бесплатно"),
    body: ru("Отсчёт идёт с момента загрузки первых товаров, а не с даты заявки."),
  },
  {
    value: "4",
    unit: ru("новые функции под ваш склад"),
    body: ru(
      "Новое поле в карточке товара, отчёт в вашей форме или свой бланк накладной. Каждая становится частью системы для всех.",
    ),
  },
  {
    value: "5",
    unit: ru("рабочих дней на функцию"),
    body: ru("Критичные ошибки исправляем сразу."),
  },
  {
    value: "10…18",
    unit: ru("чат в рабочие дни"),
    body: ru("Отвечаем по московскому времени."),
  },
];

type Stage = "idea" | "doing" | "done";

/**
 * Колонки по нарастающей (19 окт): от предложения склада к работающей
 * функции. Примеры — заглушки до решения Кирилла о содержимом карты.
 */
const ROADMAP: { stage: Stage; title: Copy; items: Copy[] }[] = [
  { stage: "idea", title: ru("Предложения"), items: [ru("Ваша функция")] },
  {
    stage: "doing",
    title: ru("В работе"),
    items: [ru("Выгрузка остатков в Excel"), ru("Вход на ТСД по QR-коду")],
  },
  {
    stage: "done",
    title: ru("Работает"),
    items: [ru("Адресное хранение"), ru("Чат с селлерами")],
  },
];

export function Offer() {
  const t = useT();

  return (
    <>
      <section className="mx-auto mt-24 flex max-w-[1280px] flex-col gap-10 px-5 sm:mt-36 sm:px-10 lg:flex-row lg:gap-20">
        <Reveal className="lg:w-[360px] lg:shrink-0">
          <h2 className="wh-h2 max-w-[11ch]">{t(T.title)}</h2>
          <p className="wh-muted mt-6 max-w-[26rem] text-[17px] leading-relaxed">{t(T.sub)}</p>
        </Reveal>

        {/* Две равные колонки на любой ширине (Кирилл 19 окт: «одинаковую
            ширину квадратов»): ширина ячейки не зависит от длины числа. */}
        <div className="grid min-w-0 flex-1 grid-cols-2 border-t border-[var(--wh-line)]">
          {NUMBERS.map((n, i) => (
            <Reveal
              key={n.unit.ru}
              delay={i * 70}
              className={cn(
                "min-w-0 border-b border-[var(--wh-line)] py-6 sm:py-7",
                i % 2 === 0 ? "pr-3 sm:pr-6" : "border-l pl-3 sm:pl-6",
              )}
            >
              <p className="text-[clamp(40px,6vw,80px)] font-light leading-[0.9] tracking-[-0.05em] text-[var(--wh-blue)]">
                {n.value}
              </p>
              <p className="mt-3.5 text-base font-medium sm:text-lg">{t(n.unit)}</p>
              <p className="wh-muted mt-1.5 text-sm leading-relaxed sm:text-[15px]">{t(n.body)}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-16 max-w-[1280px] px-5 sm:px-10">
        {/* Колонки карты — по всей ширине блока (Кирилл 19 окт), текст строкой
            над ними. */}
        <Reveal className="flex flex-col gap-8 rounded-[28px] bg-[#0d0e11] p-6 text-white sm:p-10">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between lg:gap-16">
            <div className="max-w-[560px]">
              <h3 className="text-[28px] font-normal tracking-[-0.03em]">{t(T.roadmapTitle)}</h3>
              <p className="mt-3 text-base leading-relaxed text-white/70">{t(T.roadmapBody)}</p>
            </div>
            <a href={href("/roadmap")} className="shrink-0 font-medium text-white">
              {t(T.roadmapLink)}
            </a>
          </div>
          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3 sm:gap-4">
            {ROADMAP.map((col) => (
              <div key={col.stage} className="flex flex-col gap-2">
                <span className="flex items-center gap-2 text-white/60">
                  <span
                    className={cn(
                      "block size-2 rounded-full",
                      col.stage === "idea" && "border border-white/60",
                      col.stage === "doing" && "bg-[var(--wh-blue)]",
                      col.stage === "done" && "bg-[#3ecf8e]",
                    )}
                  />
                  {t(col.title)}
                </span>
                {col.items.map((item, i) => (
                  <span
                    key={item.ru}
                    className={cn(
                      "rounded-[10px] px-3 py-2.5",
                      col.stage === "idea" && "border border-dashed border-white/30",
                      col.stage === "doing" && i === 0 && "bg-[var(--wh-blue)]",
                      col.stage !== "idea" &&
                        !(col.stage === "doing" && i === 0) &&
                        "bg-white/[0.08]",
                    )}
                  >
                    {t(item)}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </Reveal>
      </section>
    </>
  );
}
