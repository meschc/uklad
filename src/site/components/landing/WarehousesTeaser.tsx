import { ArrowRight } from "lucide-react";
import { Reveal } from "../Reveal";
import { SectionHead } from "../SectionHead";
import { WarehouseCard } from "../market/WarehouseCard";
import { warehousesRepository } from "../../data/warehousesRepository";
import { c, useT } from "../../lib/copy";
import { href } from "../../lib/route";

const T = {
  eyebrow: c("Витрина", "Marketplace"),
  title: c("Склады сравниваются по одной мерке", "Warehouses compared on one scale"),
  // Не «честная занятость и прозрачные условия»: это оценка, которую читатель
  // не может проверить, а проверить он может ровно то, что написано в карточке.
  lead: c(
    "{n} {word} на витрине. У каждого — ставки, схемы работы и свободные места.",
    "{n} {word} listed. Each one shows rates, fulfilment schemes and free space.",
  ),
  cta: c("Открыть маркетплейс", "Open the marketplace"),
  note: c(
    "Фильтры по городу, схеме, площадкам, услугам и цене — без регистрации.",
    "Filters by city, scheme, marketplace, service and price — no sign-up.",
  ),
};

/**
 * Три настоящие карточки из витрины, а не нарисованные скриншоты. Витрина —
 * главное, что здесь можно потрогать, и показывать вместо неё макет значило бы
 * прятать продукт за картинкой продукта.
 */
const SHOWCASE = warehousesRepository.featured(3);

/**
 * Подложки у секции нет — только линейки сверху и снизу. Было: подкрашенная
 * панель, поверх неё сетка-миллиметровка, а на них карточки со своим фоном.
 * Три уровня фона под одним рядом карточек — и карточка перестаёт читаться
 * как карточка.
 */
export function WarehousesTeaser() {
  const t = useT();
  const { total } = warehousesRepository.stats();

  return (
    <section id="warehouses" className="border-y border-border py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHead
          eyebrow={t(T.eyebrow)}
          title={t(T.title)}
          lead={t(T.lead, {
            n: total,
            word: t.plural(total, ["склад", "склада", "складов"], ["warehouse", "warehouses"]),
          })}
        />

        <div className="mt-14 grid gap-4 lg:grid-cols-3">
          {SHOWCASE.map((w, i) => (
            <Reveal key={w.id} delay={i * 90} className="min-w-0">
              <WarehouseCard warehouse={w} />
            </Reveal>
          ))}
        </div>

        <Reveal delay={280}>
          <div className="mt-10 text-center">
            <a
              href={href("/market")}
              className="group inline-flex h-12 items-center gap-2 rounded-full bg-primary px-7 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {t(T.cta)}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </a>
            <p className="mt-3 text-xs text-muted-foreground">{t(T.note)}</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
