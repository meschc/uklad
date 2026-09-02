import { ArrowRight } from "lucide-react";
import { Reveal } from "../Reveal";
import { SectionHead } from "../SectionHead";
import { WarehouseCard } from "../market/WarehouseCard";
import { WAREHOUSES } from "../../data/warehouses";
import { plural } from "../../lib/plural";
import { goMarket } from "../../lib/route";

/**
 * Три настоящие карточки из витрины, а не нарисованные скриншоты. Витрина —
 * главное, что здесь можно потрогать, и показывать вместо неё макет значило бы
 * прятать продукт за картинкой продукта.
 */
const SHOWCASE = [...WAREHOUSES]
  .filter((w) => w.uklad && w.verified)
  .sort((a, b) => b.rating - a.rating)
  .slice(0, 3);

/**
 * Подложки у секции нет — только линейки сверху и снизу. Было: подкрашенная
 * панель, поверх неё сетка-миллиметровка, а на них карточки со своим фоном.
 * Три уровня фона под одним рядом карточек — и карточка перестаёт читаться
 * как карточка.
 */
export function WarehousesTeaser() {
  return (
    <section id="warehouses" className="border-y border-border py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHead
          eyebrow="Витрина"
          title="Склады сравниваются по одной мерке"
          // Не «честная занятость и прозрачные условия»: это оценка, которую
          // читатель не может проверить, а проверить он может ровно то, что
          // написано в карточке ниже.
          lead={`${WAREHOUSES.length} ${plural(WAREHOUSES.length, "склад", "склада", "складов")} на витрине. У каждого — ставки, схемы работы и свободные места.`}
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
            <button
              onClick={() => goMarket()}
              className="group inline-flex h-12 items-center gap-2 rounded-full bg-primary px-7 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Открыть маркетплейс
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </button>
            <p className="mt-3 text-xs text-muted-foreground">
              Фильтры по городу, схеме, площадкам, услугам и цене — без
              регистрации.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
