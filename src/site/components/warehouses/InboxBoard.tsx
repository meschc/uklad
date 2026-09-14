import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandMark } from "../BrandMark";
import { MARKETPLACE_BY_ID } from "../../data/marketplaces";
import { money } from "../../data/warehouses";
import { warehousesRepository } from "../../data/warehousesRepository";
import { c, useT, type Copy } from "../../lib/copy";

/** Сколько заявок ещё без ответа — верхняя, та, что пришла только что. */
const NEW = 1;
/** Знаков площадок в строке — дальше строка начинает переноситься. */
const MAX_BRANDS = 4;
/** Месяц хранения: склады считают место в сутки, а деньги меряют месяцем. */
const DAYS_IN_MONTH = 30;

/**
 * Склад, чьи входящие показаны: первый проверенный склад с витрины.
 *
 * Не выдуманная карточка: цена хранения, город и время ответа в макете — те
 * самые, что стоят у него на странице. Сойдись они с витриной хоть в одной
 * цифре меньше — и макет пришлось бы править каждый раз, когда меняются данные.
 */
const HOST = warehousesRepository.featured(1)[0];

/**
 * Заявки селлеров. Названий компаний здесь нет намеренно: придумать их значит
 * показать склад, у которого уже есть клиенты, — а это ровно то, чего у него
 * пока нет. Заявка описывается тем, что в ней и правда важно складу: что за
 * товар, сколько мест и на какие площадки он поедет.
 *
 * Площадки берутся у самого склада: заявка доходит до него тогда, когда селлер
 * отобрал витрину по своей площадке, и чужих в этом списке быть не может.
 */
const REQUESTS: { goods: Copy; places: number; brands: number }[] = [
  { goods: c("Косметика и уход", "Cosmetics and skincare"), places: 180, brands: 2 },
  { goods: c("Детская одежда", "Children's clothing"), places: 64, brands: 3 },
  { goods: c("Посуда и товары для дома", "Kitchenware and homeware"), places: 320, brands: 4 },
];

const T = {
  title: c("Заявки на ваш склад", "Requests to your warehouse"),
  meta: c("{name} · {city}", "{name} · {city}"),
  count: c("{n} за неделю", "{n} this week"),
  fresh: c("Новая · ждёт ответа", "New · awaiting your answer"),
  answered: c("Вы ответили за {h} ч", "You answered in {h} h"),
  unit: c("хранение в месяц", "storage per month"),
  caption: c(
    "Так выглядят входящие: склад и цены взяты с витрины, сумма — по его прайсу хранения. Это пример оформления, а не обещание потока заявок: сколько их придёт, зависит от спроса в вашем городе.",
    "This is the inbox: the warehouse and its prices come from the marketplace, the sum from its own rates. It shows the layout, not a promised flow of requests: how many arrive depends on demand in your city.",
  ),
};

/** Месяц хранения такой заявки по прайсу склада, округлённый до сотен рублей. */
function monthly(places: number): number {
  return Math.round((places * HOST.price.storage * DAYS_IN_MONTH) / 100) * 100;
}

/**
 * Первый экран страницы для складов: что приходит складу с витрины.
 *
 * Заголовок обещает складу поток клиентов, и рядом должно быть видно, в каком
 * виде этот поток приходит: не «оставьте заявку, мы свяжемся», а очередь
 * входящих с товаром, объёмом и деньгами за месяц хранения.
 *
 * Это зеркало `sellers/RequestBoard`: там одна заявка уходит в три склада,
 * здесь три заявки приходят в один. Обе панели показывают одно и то же событие
 * с двух сторон — и потому обе намеренно сделаны в одной вёрстке.
 */
export function InboxBoard() {
  const t = useT();

  return (
    <figure className="m-0">
      <div className="r-window border border-foreground/[0.09]">
        <header className="flex items-baseline justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="font-display text-[15px] font-medium tracking-tight">{t(T.title)}</p>
            <p className="mt-1 truncate text-[12px] text-muted-foreground">
              {t(T.meta, { name: t(HOST.name), city: t(HOST.cityTitle) })}
            </p>
          </div>
          <span className="shrink-0 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {t(T.count, { n: REQUESTS.length })}
          </span>
        </header>

        <ul>
          {REQUESTS.map((r, i) => (
            <li key={r.goods.ru} className={cn("px-5 py-4", i > 0 && "border-t border-border")}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate font-display text-[15px] font-medium tracking-tight">
                    {t(r.goods)}
                  </p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px]">
                    {i < NEW ? (
                      <>
                        {/* Точка пульсирует только у неотвеченной заявки: это
                            единственная строка, где от склада ждут действия
                            прямо сейчас. */}
                        <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                        <span className="text-primary">{t(T.fresh)}</span>
                      </>
                    ) : (
                      <>
                        <Check className="size-3.5 text-muted-foreground" strokeWidth={2.5} />
                        <span className="text-muted-foreground">
                          {t(T.answered, { h: HOST.responseHours })}
                        </span>
                      </>
                    )}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <p className="font-mono text-[13px] tabular-nums">{money(monthly(r.places))} ₽</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{t(T.unit)}</p>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-1.5">
                {HOST.marketplaces.slice(0, Math.min(r.brands, MAX_BRANDS)).map((id) => {
                  const brand = MARKETPLACE_BY_ID[id];
                  return brand ? <BrandMark key={id} brand={brand} className="size-5" /> : null;
                })}
                <span className="ml-1 text-[11px] tabular-nums text-muted-foreground">
                  {r.places} {t.plural(r.places, ["место", "места", "мест"], ["slot", "slots"])}
                </span>
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
