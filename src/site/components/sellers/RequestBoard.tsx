import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandMark } from "../BrandMark";
import { MARKETPLACE_BY_ID } from "../../data/marketplaces";
import { money, type Warehouse } from "../../data/warehouses";
import { warehousesRepository } from "../../data/warehousesRepository";
import { c, useT } from "../../lib/copy";

/** Сколько складов показываем в заявке. */
const SHOWN = 3;
/**
 * Сколько из них уже ответили: одно «да» и два ожидания.
 *
 * Было наоборот — два ответа из трёх, — и это обещало скорость, которой у
 * начинающегося рынка нет: пока в системе нет ни одного настоящего отклика,
 * красивый макет работает как обещание, данное за склады. Один ответ из трёх
 * показывает оба состояния так же наглядно, но не обещает ничего лишнего.
 */
const ANSWERED = 1;
/** Знаков площадок в строке — дальше строка начинает переноситься. */
const MAX_BRANDS = 4;
/** Город и объём заявки в макете. `REQUEST_CITY` — ключ фильтра, он русский. */
const REQUEST_CITY = "Москва";
const REQUEST_PLACES = 180;

const T = {
  title: c("Заявка на размещение", "Storage request"),
  meta: c("{n} паллето-мест · {city} · FBO и FBS", "{n} pallet slots · {city} · FBO and FBS"),
  city: c("Москва", "Moscow"),
  ready: c("Готов принять", "Ready to take it"),
  answered: c("· ответ за {h} ч", "· answered in {h} h"),
  waiting: c("Ждём ответа · склад обещает {h} ч", "Awaiting an answer · {h} h promised"),
  unit: c("место / сутки", "slot / day"),
  caption: c(
    "Пример оформления, а не обещание отклика: склады настоящие, из витрины, сроки — те, что они называют сами. Ответит ли склад на конкретную заявку, зависит от склада.",
    "An example of the layout, not a promise of an answer: the warehouses are real ones from the marketplace and the hours are their own claims. Whether a warehouse answers your request is up to it.",
  ),
};

/**
 * Склады в заявке — настоящие карточки витрины, а не выдуманные названия.
 *
 * Из одного города: заявка на 180 мест, разосланная в Москву, Казань и
 * Новосибирск сразу, — это не подбор склада, а бессмыслица, и первый же
 * внимательный читатель на ней спотыкается.
 */
const CANDIDATES: Warehouse[] = (() => {
  const all = warehousesRepository.list();
  const inCity = all.filter((w) => w.uklad && w.city === REQUEST_CITY);
  const pool = inCity.length >= SHOWN ? inCity : all.filter((w) => w.uklad);
  return pool.slice(0, SHOWN);
})();

/**
 * Первый экран страницы селлера: как склад отвечает на заявку.
 *
 * Заголовок обещает склад, «с которым не нужно договариваться лично», и рядом
 * должно быть видно, чем этот разговор заменён: заявка ушла в несколько
 * складов сразу, ответы вернулись в кабинет, у каждого своя цена и свои
 * площадки. Не звонок, не переписка в мессенджере, не «пришлите КП на почту».
 *
 * Это намеренно не тот же макет, что на лендинге. Там справа состояние товара
 * («что с ним происходит прямо сейчас») — потому что лендинг продаёт складу
 * WMS, а витрина показывает её результат. Здесь речь идёт о шаге раньше: товара
 * ещё нет ни на одном складе, и селлеру нужно понять, как он этот склад
 * выбирает. Повтори мы лендинговую панель — обе страницы читались бы как одна.
 *
 * Фон один — фон страницы. Всё остальное держится на волосяных линейках, как и
 * на остальной витрине.
 */
export function RequestBoard() {
  const t = useT();

  return (
    <figure className="m-0">
      <div className="r-window border border-foreground/[0.09]">
        <header className="flex items-baseline justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="font-display text-[15px] font-medium tracking-tight">{t(T.title)}</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {t(T.meta, { n: REQUEST_PLACES, city: t(T.city) })}
            </p>
          </div>
          <span className="shrink-0 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {CANDIDATES.length}{" "}
            {t.plural(
              CANDIDATES.length,
              ["склад", "склада", "складов"],
              ["warehouse", "warehouses"],
            )}
          </span>
        </header>

        <ul>
          {CANDIDATES.map((w, i) => (
            <li key={w.id} className={cn("px-5 py-4", i > 0 && "border-t border-border")}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate font-display text-[15px] font-medium tracking-tight">
                    {t(w.name)}
                  </p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px]">
                    {i < ANSWERED ? (
                      <>
                        <Check className="size-3.5 text-primary" strokeWidth={2.5} />
                        <span className="text-primary">{t(T.ready)}</span>
                        <span className="text-muted-foreground">
                          {t(T.answered, { h: w.responseHours })}
                        </span>
                      </>
                    ) : (
                      <>
                        {/* Точка пульсирует только у ожидания: движение здесь
                            означает «идёт прямо сейчас», и если пульсировать
                            будет всё, оно перестанет означать что-либо. */}
                        <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/70" />
                        <span className="text-muted-foreground">
                          {t(T.waiting, { h: w.responseHours })}
                        </span>
                      </>
                    )}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <p className="font-mono text-[13px] tabular-nums">{money(w.price.storage)} ₽</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{t(T.unit)}</p>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-1.5">
                {w.marketplaces.slice(0, MAX_BRANDS).map((id) => {
                  const brand = MARKETPLACE_BY_ID[id];
                  return brand ? <BrandMark key={id} brand={brand} className="size-5" /> : null;
                })}
                {w.marketplaces.length > MAX_BRANDS && (
                  <span className="text-[11px] text-muted-foreground">
                    +{w.marketplaces.length - MAX_BRANDS}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <figcaption className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
        {t(T.caption)}
      </figcaption>
    </figure>
  );
}
