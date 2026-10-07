import { ArrowRight } from "lucide-react";
import { Reveal } from "../Reveal";
import { href } from "../../lib/route";
import { ctaPill } from "../../lib/button";
import { CITIES } from "../../data/cities";
import { warehousesRepository } from "../../data/warehousesRepository";
import { c, useT } from "../../lib/copy";

const T = {
  titleTop: c("Отдайте товар складу.", "Hand the goods to a warehouse."),
  titleAccent: c("Не отдавайте контроль.", "Don’t hand over control."),
  lead: c(
    "{n} {warehouses} в {c} {cities}, одинаковые прайсы и статус товара в кабинете. Подбор занимает минуту.",
    "{n} {warehouses} in {c} {cities}, price lists on one scale and live status in your account. Picking one takes a minute.",
  ),
  cta: c("Подобрать склад", "Find a warehouse"),
};

/**
 * Финал. Один лозунг, одна кнопка, ноль новых мыслей: место, где человек уже
 * всё прочитал и ему нужно только куда нажать.
 */
export function FinalCta() {
  const t = useT();
  const { total } = warehousesRepository.stats();

  return (
    // Заливка одна — тёмная полоса `ink`. Пятно света поверх неё убрано: оно
    // добавляло второй фон ради самого себя и ровно так же размывало текст.
    <section className="ink relative overflow-hidden">
      <div className="relative mx-auto max-w-4xl px-4 py-24 text-center sm:px-6 sm:py-32">
        <Reveal>
          <h2 className="font-display text-4xl font-heading leading-display tracking-tight sm:text-6xl">
            {t(T.titleTop)}
            <br />
            {/* Вторая строка — единственное цветное пятно в блоке. Градиент
                здесь стоял ради красоты и съедал ровно то ударение, ради
                которого написана вся фраза. */}
            <span className="text-primary">{t(T.titleAccent)}</span>
          </h2>
        </Reveal>

        <Reveal delay={110}>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {t(T.lead, {
              n: total,
              warehouses: t.plural(
                total,
                ["склад", "склада", "складов"],
                ["warehouse", "warehouses"],
              ),
              c: CITIES.length,
              cities: t.plural(CITIES.length, ["городе", "городах", "городах"], ["city", "cities"]),
            })}
          </p>
        </Reveal>

        <Reveal delay={200}>
          {/* Кнопка одна. Рядом стояла вторая — «посмотреть демо WMS», — и
              финал страницы задавал человеку вопрос вместо того, чтобы дать
              действие: подобрать склад или посмотреть чужую учётную систему.
              Это разные люди и разные намерения, и в конце страницы для
              селлера остаётся то, за чем он пришёл. */}
          <div className="mt-9 flex justify-center">
            <a href={href("/market")} className={ctaPill("w-full sm:w-auto")}>
              {t(T.cta)}
              {/* Та же пилюля в пилюле, что и на первом экране: два конца
                  страницы держит одна форма — теперь буквально одна,
                  [`ctaPill`](../../lib/button.ts), а не две копии. */}
              <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors group-hover:bg-primary/85">
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
