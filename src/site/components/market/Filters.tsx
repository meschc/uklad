import { useState } from "react";
import { BadgeCheck, RotateCcw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandMark } from "../BrandMark";
import { LogoMark } from "../Logo";
import { CITIES } from "../../data/cities";
import { MARKETPLACES, SCHEMES, SERVICES } from "../../data/marketplaces";
import {
  DEFAULT_FILTERS,
  PRICE_MAX,
  PRICE_MIN,
  activeCount,
  toggle,
  type MarketFilters,
} from "../../lib/filters";
import { c, useT } from "../../lib/copy";

const SERVICES_SHOWN = 8;

const T = {
  search: c("Название, город или улица", "Name, city or street"),
  city: c("Город", "City"),
  allCities: c("Все города", "All cities"),
  scheme: c("Схема работы", "Fulfilment model"),
  ships: c("Отгружает на площадки", "Ships to marketplaces"),
  andNote: c(
    "Условия складываются: склад должен уметь во все отмеченные площадки сразу.",
    "Filters add up: a warehouse must handle every marketplace you tick.",
  ),
  price: c("Хранение, ₽ за место в сутки", "Storage, ₽ per slot a day"),
  from: c("от {n} ₽", "from {n} ₽"),
  to: c("до {n} ₽", "up to {n} ₽"),
  services: c("Услуги", "Services"),
  collapse: c("Свернуть", "Collapse"),
  more: c("Ещё {n}", "{n} more"),
  marks: c("Отметки", "Badges"),
  verified: c("Проверенные Укладом", "Verified by Uklad"),
  withAccount: c("С кабинетом Уклада", "With an Uklad account"),
  reset: c("Сбросить", "Reset"),
};

/**
 * Панель условий. Все переключатели работают на «и» — и об этом честно
 * написано под площадками, иначе селлер выбирает три площадки, получает пустой
 * список и решает, что витрина сломалась.
 */
export function Filters({
  value,
  onChange,
}: {
  value: MarketFilters;
  onChange: (next: MarketFilters) => void;
}) {
  const t = useT();
  const [allServices, setAllServices] = useState(false);
  const set = (patch: Partial<MarketFilters>) => onChange({ ...value, ...patch });
  const active = activeCount(value);
  const services = allServices ? SERVICES : SERVICES.slice(0, SERVICES_SHOWN);

  return (
    <div className="flex flex-col gap-6">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={value.q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder={t(T.search)}
          className="h-10 w-full rounded-full border border-border bg-background pl-10 pr-4 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
        />
      </div>

      <Group title={t(T.city)}>
        <select
          value={value.city}
          onChange={(e) => set({ city: e.target.value })}
          className="h-10 w-full rounded-full border border-border bg-background px-3.5 text-sm outline-none transition-colors focus:border-primary"
        >
          <option value="">{t(T.allCities)}</option>
          {CITIES.map((city) => (
            <option key={city.name} value={city.name}>
              {t(city.title)}
            </option>
          ))}
        </select>
      </Group>

      <Group title={t(T.scheme)}>
        <div className="flex flex-wrap gap-1.5">
          {SCHEMES.map((s) => (
            <Chip
              key={s.id}
              on={value.schemes.includes(s.id)}
              title={t(s.hint)}
              onClick={() => set({ schemes: toggle(value.schemes, s.id) })}
            >
              {s.title}
            </Chip>
          ))}
        </div>
      </Group>

      <Group title={t(T.ships)}>
        <div className="flex flex-wrap gap-1.5">
          {MARKETPLACES.map((m) => (
            <Chip
              key={m.id}
              on={value.marketplaces.includes(m.id)}
              onClick={() => set({ marketplaces: toggle(value.marketplaces, m.id) })}
            >
              <BrandMark brand={m} className="-ml-1 size-4" />
              {t(m.title)}
            </Chip>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{t(T.andNote)}</p>
      </Group>

      <Group title={t(T.price)}>
        <input
          type="range"
          min={PRICE_MIN}
          max={PRICE_MAX}
          value={value.maxStorage}
          onChange={(e) => set({ maxStorage: Number(e.target.value) })}
          className="range-input w-full"
        />
        <div className="mt-1 flex justify-between text-[11px] tabular-nums text-muted-foreground">
          <span>{t(T.from, { n: PRICE_MIN })}</span>
          <span className={cn(value.maxStorage < PRICE_MAX && "font-semibold text-primary")}>
            {t(T.to, { n: value.maxStorage })}
          </span>
        </div>
      </Group>

      <Group title={t(T.services)}>
        <div className="flex flex-wrap gap-1.5">
          {services.map((s) => (
            <Chip
              key={s.id}
              on={value.services.includes(s.id)}
              onClick={() => set({ services: toggle(value.services, s.id) })}
            >
              {t(s.title)}
            </Chip>
          ))}
        </div>
        {SERVICES.length > SERVICES_SHOWN && (
          <button
            onClick={() => setAllServices((v) => !v)}
            className="mt-2 text-xs font-medium text-primary hover:underline"
          >
            {allServices ? t(T.collapse) : t(T.more, { n: SERVICES.length - SERVICES_SHOWN })}
          </button>
        )}
      </Group>

      <Group title={t(T.marks)}>
        <div className="flex flex-col gap-1.5">
          <Switch
            on={value.verifiedOnly}
            onClick={() => set({ verifiedOnly: !value.verifiedOnly })}
          >
            <BadgeCheck className="size-4 text-primary" />
            {t(T.verified)}
          </Switch>
          <Switch on={value.ukladOnly} onClick={() => set({ ukladOnly: !value.ukladOnly })}>
            <LogoMark className="size-4" />
            {t(T.withAccount)}
          </Switch>
        </div>
      </Group>

      <button
        onClick={() => onChange({ ...DEFAULT_FILTERS, sort: value.sort })}
        disabled={active === 0}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-border text-sm font-medium transition-colors enabled:hover:bg-muted disabled:opacity-40"
      >
        <RotateCcw className="size-3.5" />
        {t(T.reset)}
        {active > 0 && ` (${active})`}
      </button>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

function Chip({
  on,
  onClick,
  title,
  children,
}: {
  on: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200",
        on
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:border-foreground/25 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Switch({
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
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-medium transition-colors",
        on ? "border-primary bg-primary/[0.07]" : "border-border hover:bg-muted",
      )}
    >
      {children}
      <span
        className={cn(
          "ml-auto flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors",
          on ? "bg-primary" : "bg-muted-foreground/30",
        )}
      >
        <span
          className={cn(
            "size-3 rounded-full bg-white shadow transition-transform",
            on && "translate-x-3",
          )}
        />
      </span>
    </button>
  );
}
