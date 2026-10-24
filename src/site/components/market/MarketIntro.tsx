import { AsciiScene } from "../frame/AsciiScene";
import { useMemo } from "react";
import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { money, type Warehouse } from "../../data/warehouses";
import { warehousesRepository } from "../../data/warehousesRepository";
import { c, useT } from "../../lib/copy";
import type { MarketFilters as Filters } from "../../lib/filters";
import { Reveal } from "../Reveal";

const T = {
  title: c("Склады для фулфилмента", "Fulfilment warehouses"),
  lead: c(
    "Одинаковые карточки и прайс, свободные места по каждому складу. Заявка бесплатна: витрина не берёт комиссию с селлера.",
    "The same card and the same price list for everyone, free slots per warehouse. Requests are free: we take no seller commission.",
  ),
  badge: c(
    "Галочка значит одно: Уклад сверил регистрацию компании и право на помещение. Как склад работает, она не оценивает — про это отзывы.",
    "A check mark means one thing: Uklad verified the company registration and the right to use the premises. How the warehouse works is what reviews are for.",
  ),
  found: c("складов под ваши условия", "warehouses match"),
  cities: c("городов", "cities"),
  verified: c("проверены Укладом", "verified by Uklad"),
  free: c("свободных мест", "free slots"),
  allCities: c("Все города", "All cities"),
  citiesLabel: c("Быстрый выбор города", "Quick city choice"),
};

/** Сколько городов показывать чипами; остальные — в фильтре слева. */
const TOP_CITIES = 7;

/**
 * Первый экран каталога (22 окт). Не синий, как у страницы для складов:
 * каталог — рабочий инструмент, и наверху у него не обещание, а сводка по
 * выдаче. Четыре числа стоят ровными столбцами и пересчитываются вместе с
 * отбором; под ними — города чипами, самый частый первый шаг отбора в один
 * клик.
 */
export function MarketIntro({
  found,
  filters,
  onFilters,
}: {
  found: Warehouse[];
  filters: Filters;
  onFilters: (next: Filters) => void;
}) {
  const t = useT();

  // Города считаются по всему каталогу, а не по выдаче: иначе выбранный город
  // оставлял бы в ряду только себя, и переключиться было бы некуда.
  const cities = useMemo(() => {
    const byCity = new Map<string, { id: string; title: Warehouse["cityTitle"]; n: number }>();
    for (const w of warehousesRepository.list()) {
      const cur = byCity.get(w.city);
      if (cur) cur.n += 1;
      else byCity.set(w.city, { id: w.city, title: w.cityTitle, n: 1 });
    }
    return [...byCity.values()].sort((a, b) => b.n - a.n).slice(0, TOP_CITIES);
  }, []);

  const stats = [
    { n: found.length, label: t(T.found) },
    { n: new Set(found.map((w) => w.city)).size, label: t(T.cities) },
    { n: found.filter((w) => w.verified).length, label: t(T.verified) },
    { n: found.reduce((sum, w) => sum + w.cellsFree, 0), label: t(T.free) },
  ];

  const setCity = (city: string) => onFilters({ ...filters, city });

  return (
    <div className="relative">
      {/* Стеллажи из знаков в шапке каталога (Кирилл 23 окт): бледные и
          прижаты к правому краю, чтобы не спорить с отбором. */}
      <div
        aria-hidden
        className="absolute inset-0 [mask-image:linear-gradient(90deg,transparent_50%,#000_85%)]"
      >
        <AsciiScene kind="racks" ink="17,17,17" density={0.8} className="opacity-45" />
      </div>
      <section className="relative mx-auto max-w-[1280px] px-5 pt-12 sm:px-10 sm:pt-20">
        <Reveal className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end lg:gap-16">
          <div>
            <h1 className="max-w-[12ch] text-[clamp(44px,5vw,76px)] font-normal leading-[0.98] tracking-[-0.045em] [text-wrap:balance]">
              {t(T.title)}
            </h1>
            <p className="mt-6 max-w-[46ch] text-[17px] leading-[1.55] text-[var(--wh-muted)]">
              {t(T.lead)}
            </p>
          </div>

          {/* Числа — сеткой с одинаковыми колонками, а не строкой через
            пробелы: так разряды стоят друг под другом (Кирилл 20 окт). */}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-8 border-t border-[var(--wh-line)] pt-6">
            {stats.map((s) => (
              <div key={s.label} className="min-w-0">
                <dt className="sr-only">{s.label}</dt>
                <dd>
                  <span
                    key={s.n}
                    className="wh-swap block text-[clamp(40px,4.4vw,64px)] font-light leading-none tracking-[-0.05em] tabular-nums"
                  >
                    {money(s.n)}
                  </span>
                  <span aria-hidden className="mt-2 block text-sm text-[var(--wh-muted)]">
                    {s.label}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>

        <Reveal delay={120} className="mt-12 flex flex-col gap-5">
          <div
            role="group"
            aria-label={t(T.citiesLabel)}
            className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
          >
            <CityChip on={!filters.city} onClick={() => setCity("")}>
              {t(T.allCities)}
            </CityChip>
            {cities.map((city) => (
              <CityChip
                key={city.id}
                on={filters.city === city.id}
                onClick={() => setCity(filters.city === city.id ? "" : city.id)}
              >
                {t(city.title)}
                <span className="tabular-nums opacity-60">{city.n}</span>
              </CityChip>
            ))}
          </div>
          <p className="flex max-w-3xl items-start gap-2 text-sm leading-relaxed text-[var(--wh-muted)]">
            <BadgeCheck className="mt-0.5 size-4 shrink-0 text-[var(--wh-blue)]" />
            {t(T.badge)}
          </p>
        </Reveal>
      </section>
    </div>
  );
}

function CityChip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors",
        on
          ? "bg-[var(--wh-blue)] text-[var(--wh-on-blue)]"
          : "bg-[var(--wh-soft)] text-[var(--wh-ink)] hover:bg-[var(--wh-line)]",
      )}
    >
      {children}
    </button>
  );
}
