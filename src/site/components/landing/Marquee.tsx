import { MARKETPLACES } from "../../data/marketplaces";
import { BrandMark } from "../BrandMark";
import { c, useT } from "../../lib/copy";
import { eyebrow } from "../../lib/eyebrow";

/**
 * Лента площадок. Отвечает на первый вопрос селлера — «а с моим маркетплейсом
 * тут работают?» — до того, как он его задал.
 *
 * Список продублирован в разметке: анимация сдвигает ленту ровно на половину
 * ширины, и вторая копия в этот момент встаёт на место первой. Стык не виден,
 * поэтому и остановки в бесконечной прокрутке нет.
 *
 * Отступ сверху — у ленты, а не у первого экрана. Герой заканчивается строкой
 * фактов и своего нижнего поля не имеет: лента с одним лишь `py` упиралась
 * рамкой прямо в эту строку и читалась как её продолжение, а не как отдельная
 * полоса.
 */
const T = { label: c("Отгрузка на площадки", "Shipping to marketplaces") };

export function Marquee() {
  const t = useT();
  const row = [...MARKETPLACES, ...MARKETPLACES];

  return (
    <section className="mt-24 border-y border-border bg-muted/30 py-10 sm:mt-32 sm:py-12">
      <p className={eyebrow("mb-7 text-center text-muted-foreground")}>{t(T.label)}</p>
      <div className="relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
        <div className="flex w-max animate-marquee items-center gap-12 pr-12">
          {row.map((m, i) => (
            <span
              key={`${m.id}-${i}`}
              className="flex shrink-0 items-center gap-2.5 opacity-90 transition-opacity hover:opacity-100"
            >
              <BrandMark brand={m} className="size-9" />
              <span className="whitespace-nowrap text-sm font-medium text-muted-foreground">
                {t(m.title)}
              </span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
