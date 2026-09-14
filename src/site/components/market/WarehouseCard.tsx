import { AlertTriangle, BadgeCheck, Check, Clock, MapPin, Scale, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandMark } from "../BrandMark";
import { WarehouseCover } from "./WarehouseCover";
import { MARKETPLACE_BY_ID } from "../../data/marketplaces";
import { money, type Warehouse } from "../../data/warehouses";
import { COMPARE_LIMIT } from "../../lib/compare";
import { PAGE_NOW, shortDate } from "../../lib/date";
import { estimateMonth, fitsVolume, isVolumeSet, type SellerVolume } from "../../lib/estimate";
import { freshness } from "../../lib/freshness";
import { warehouseHref } from "../../lib/route";
import { c, useT } from "../../lib/copy";

const MAX_BRANDS = 5;

const T = {
  verified: c(
    "Проверен Укладом: регистрация компании и право на помещение",
    "Verified by Uklad: company registration and right to the premises",
  ),
  reviews: c("{n} {word}", "{n} {word}"),
  noReviews: c("Отзывов пока нет", "No reviews yet"),
  complaint: c("Открытая жалоба", "Open complaint"),
  complaints: c("Открытых жалоб: {n}", "Open complaints: {n}"),
  storage: c("Хранение", "Storage"),
  storageUnit: c("₽ / место в сутки", "₽ / slot a day"),
  receiving: c("Приёмка", "Intake"),
  receivingUnit: c("₽ / короб", "₽ / box"),
  picking: c("Сборка", "Picking"),
  pickingUnit: c("₽ / заказ", "₽ / order"),
  free: c("свободно {n}", "{n} free"),
  stale: c("Цены не подтверждались с {date}", "Rates unconfirmed since {date}"),
  uncompare: c("Убрать из сравнения: {name}", "Remove from comparison: {name}"),
  compare: c("Сравнить: {name}", "Compare: {name}"),
  compareLimit: c(
    "Сравнить можно {n} склада разом",
    "Up to {n} warehouses can be compared at once",
  ),
  inCompare: c("В сравнении", "Comparing"),
  compareShort: c("Сравнить", "Compare"),
  tooBig: c("Не возьмёт весь объём: свободно {n} мест", "Cannot take it all: {n} slots free"),
  tooSmall: c("Берёт от {n} мест хранения", "Takes from {n} storage slots"),
  perMonth: c("в месяц под ваш объём", "a month for your volume"),
};

/**
 * Карточка склада в списке.
 *
 * Главное решение здесь — прайс на одинаковых местах у всех складов. Именно
 * ради этого витрина и затевалась: сравнить два фулфилмента по присланным PDF
 * нельзя, а по трём числам в одной сетке — можно.
 *
 * Второе решение — что в карточке НЕ показывать. Раньше сюда помещалось всё,
 * что известно о складе: плашка про план склада, две строки описания, четыре
 * цены, полоса занятости, отдельная строка «свободно». Каждый элемент по
 * отдельности осмысленный, а вместе — двенадцать чисел в блоке размером с
 * ладонь, по которым ничего нельзя сравнить, потому что глазу не за что
 * зацепиться. Список нужен для отбора, а не для решения: имя, город, цена,
 * куда отгружает, есть ли места. Всё остальное — на странице склада.
 *
 * Карточка — ссылка, а не кликабельный `<article>`: склады сравнивают,
 * открывая их в соседних вкладках, и это должно работать средней кнопкой мыши
 * и Cmd-кликом, без нашего участия.
 *
 * Обложка занимает всю ширину, до самого края карточки. Вложенного скругления
 * не возникает: радиус на сайте один и тот же для всех уровней и равен двум
 * пикселям — обрезать картинку по внутреннему радиусу не от чего.
 */
export function WarehouseCard({
  warehouse: w,
  highlighted = false,
  volume,
  compared = false,
  compareFull = false,
  onCompare,
}: {
  warehouse: Warehouse;
  /** Карточка подсвечена наведением на точку карты. */
  highlighted?: boolean;
  /** Оборот селлера; пока не задан — карточка показывает только прайс. */
  volume?: SellerVolume;
  /** Склад отмечен для сравнения. */
  compared?: boolean;
  /** Набор для сравнения полон — отметить ещё один нельзя. */
  compareFull?: boolean;
  /** Без обработчика отметки кнопки сравнения на карточке нет вовсе. */
  onCompare?: (id: string) => void;
}) {
  const t = useT();

  return (
    // Обёртка нужна ровно затем, чтобы кнопка сравнения не оказалась внутри
    // ссылки: кнопка внутри `a` — недопустимая разметка, и браузеры расходятся
    // в том, что считать нажатием. Здесь ссылка и кнопка — соседи, а не
    // вложенные друг в друга элементы.
    <div className="relative h-full min-w-0">
      {onCompare && (
        <CompareToggle
          name={t(w.name)}
          on={compared}
          disabled={!compared && compareFull}
          onToggle={() => onCompare(w.id)}
        />
      )}
      <a
        href={warehouseHref(w.id)}
        className={cn(
          // min-w-0 обязателен: внутри карточки есть строки с `truncate`, а у
          // элемента сетки минимальная ширина по умолчанию равна min-content —
          // и колонка раздувалась под неразрывное название с адресом, вылезая
          // за экран телефона вместо того, чтобы обрезать текст многоточием.
          "r-window group flex h-full min-w-0 flex-col overflow-hidden border bg-card transition-colors",
          highlighted || compared ? "border-primary" : "border-border hover:border-primary/40",
        )}
      >
        <CardBody warehouse={w} volume={volume} />
      </a>
    </div>
  );
}

/** Содержимое карточки. Отдельно от ссылки — чтобы ссылка читалась целиком. */
function CardBody({ warehouse: w, volume }: { warehouse: Warehouse; volume?: SellerVolume }) {
  const t = useT();
  // Строка про несвежие данные — единственное состояние свежести, которое видно
  // в списке. Подписать все три значило бы поставить на каждую карточку по
  // строчке, которая ни на что не влияет: «подтверждено в июле» читателю
  // ничего не говорит, пока он не наткнётся на «не подтверждалось с марта».
  const stale = freshness(w.confirmedAt, PAGE_NOW, w.uklad) === "stale";

  return (
    <>
      <WarehouseCover warehouse={w} />

      {/* Воздуха в карточке больше, чем требует сетка, и это осознанно: список
          просматривают глазами по диагонали, и разделяет строки в нём не
          линейка, а пустота вокруг них. Подвал прижат к низу (`mt-auto`) —
          соседние карточки в ряду разной высоты, и без этого схемы работы у
          одной оказывались на уровне цен у другой. */}
      <div className="flex min-w-0 flex-1 flex-col p-5 sm:p-6">
        <header className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h3 className="truncate font-display text-base font-medium tracking-tight">
                {t(w.name)}
              </h3>
              {w.verified && (
                // Не «документы проверены» вообще: галочку ставит Уклад и
                // только по своей проверке — кто проверял и что именно, должно
                // быть слышно и тому, кто читает страницу голосом. `title`
                // висит на обёртке (иконка Lucide его не принимает) и делает
                // то же самое для мыши: значок без подписи каждый достраивает
                // сам, и достраивает обычно в сторону «ручаемся за качество».
                <span className="flex shrink-0" title={t(T.verified)}>
                  <BadgeCheck className="size-4 text-primary" aria-label={t(T.verified)} />
                </span>
              )}
            </div>
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3 shrink-0" />
              <span className="truncate">
                {t(w.cityTitle)}, {t(w.address)}
              </span>
            </p>
          </div>
          <ReputationMark warehouse={w} />
        </header>

        {/* Три цены, а не четыре: маркировка нужна не всем и живёт на странице
            склада вместе с остальным прайсом. Здесь — то, что платят все. */}
        <dl className="r-inset mt-5 grid grid-cols-3 gap-px overflow-hidden bg-border">
          <PriceCell label={t(T.storage)} value={w.price.storage} unit={t(T.storageUnit)} accent />
          <PriceCell label={t(T.receiving)} value={w.price.receiving} unit={t(T.receivingUnit)} />
          <PriceCell label={t(T.picking)} value={w.price.picking} unit={t(T.pickingUnit)} />
        </dl>

        {stale && (
          <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Clock className="size-3 shrink-0" />
            <span className="truncate">
              {t(T.stale, { date: shortDate(t.lang, w.confirmedAt) })}
            </span>
          </p>
        )}

        {volume && isVolumeSet(volume) && <EstimateRow warehouse={w} volume={volume} />}

        {/* Переносится подвал целиком, а не знаки площадок внутри него. Раньше
            было наоборот: внутренний ряд заворачивался на вторую строку, а
            «свободно» оставалось на первой — и упиралось в последний значок,
            потому что между ними оставался единственный зазор в 12 пикселей.
            Теперь ряд знаков неразрывный: когда строки на всё не хватает, вниз
            уезжает счётчик мест, а не половина логотипов. */}
        <footer className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-5">
          <span className="flex shrink-0 items-center gap-1.5">
            {w.schemes.map((s) => (
              <span
                key={s}
                className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-bold tracking-wide text-muted-foreground"
              >
                {s}
              </span>
            ))}
            {w.marketplaces.slice(0, MAX_BRANDS).map((id) => {
              const brand = MARKETPLACE_BY_ID[id];
              return brand ? <BrandMark key={id} brand={brand} className="size-5" /> : null;
            })}
            {w.marketplaces.length > MAX_BRANDS && (
              <span className="text-[11px] text-muted-foreground">
                +{w.marketplaces.length - MAX_BRANDS}
              </span>
            )}
          </span>
          <span className="ml-auto shrink-0 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
            {t(T.free, { n: money(w.cellsFree) })}
          </span>
        </footer>
      </div>
    </>
  );
}

/**
 * Правый угол шапки: оценка, отзывы и открытая жалоба.
 *
 * Звезда рисуется только тогда, когда за ней стоят отзывы. Пустая звезда с
 * нулём — самая частая ложь в каталогах: склад, о котором ещё никто не писал,
 * выглядит в ней хуже склада с тремя тройками, хотя про него попросту ничего
 * не известно. Поэтому у новичка здесь не оценка, а фраза «отзывов пока нет» —
 * и это честное состояние рынка, который только начинается.
 *
 * Открытая жалоба висит на карточке, пока склад не ответил публично, — в этом
 * весь смысл: отвечать невыгодно молчать, а не жаловаться. Число жалоб
 * показывается со второй: «жалоб: 3» на фоне одной строки читается как счёт,
 * а одна жалоба — как случай.
 */
function ReputationMark({ warehouse: w }: { warehouse: Warehouse }) {
  const t = useT();
  const { rating, reviews, openComplaints } = w.reputation;

  return (
    <div className="shrink-0 text-right">
      {rating === null ? (
        <span className="text-[11px] text-muted-foreground">{t(T.noReviews)}</span>
      ) : (
        <>
          <span className="flex items-center justify-end gap-1 text-sm font-semibold">
            <Star className="size-3.5 fill-amber-400 text-amber-400" />
            {rating.toFixed(1)}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {t(T.reviews, {
              n: reviews,
              word: t.plural(reviews, ["отзыв", "отзыва", "отзывов"], ["review", "reviews"]),
            })}
          </span>
        </>
      )}
      {openComplaints > 0 && (
        <span className="mt-1 flex items-center justify-end gap-1 text-[11px] text-amber-600 dark:text-amber-500">
          <AlertTriangle className="size-3 shrink-0" />
          {openComplaints > 1 ? t(T.complaints, { n: openComplaints }) : t(T.complaint)}
        </span>
      )}
    </div>
  );
}

/**
 * Отметка «сравнить» поверх обложки.
 *
 * Поверх картинки, а не в подвале карточки: подвал уже занят схемами работы и
 * знаками площадок, а отметка нужна на пути глаза сверху вниз — её ставят до
 * того, как дочитают карточку до конца.
 *
 * Когда набор полон, кнопка гаснет, но не исчезает: исчезнувшая кнопка
 * читается как поломка витрины, а погасшая с подписью объясняет себя сама.
 */
function CompareToggle({
  name,
  on,
  disabled,
  onToggle,
}: {
  name: string;
  on: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const t = useT();

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={on}
      aria-label={t(on ? T.uncompare : T.compare, { name })}
      title={disabled ? t(T.compareLimit, { n: COMPARE_LIMIT }) : undefined}
      className={cn(
        "absolute right-3 top-3 z-10 inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11px] font-medium backdrop-blur transition-colors",
        on
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border/60 bg-background/85 text-muted-foreground hover:text-foreground disabled:opacity-40",
      )}
    >
      {on ? <Check className="size-3" strokeWidth={3} /> : <Scale className="size-3" />}
      {t(on ? T.inCompare : T.compareShort)}
    </button>
  );
}

/**
 * Месяц под объём селлера — то, ради чего в карточке вообще есть цены.
 *
 * Склад, который такой объём не возьмёт, из списка не выбрасывается: пропажа
 * склада читается как поломка витрины. Вместо суммы он говорит, почему не
 * подходит, — и это ровно тот отказ, который иначе пришёл бы через два дня
 * после заявки.
 */
function EstimateRow({ warehouse: w, volume }: { warehouse: Warehouse; volume: SellerVolume }) {
  const t = useT();

  if (!fitsVolume(w, volume)) {
    const tooBig = volume.places > w.cellsFree;
    return (
      <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
        {tooBig ? t(T.tooBig, { n: money(w.cellsFree) }) : t(T.tooSmall, { n: money(w.minPlaces) })}
      </p>
    );
  }

  return (
    <p className="mt-3 flex items-baseline gap-1.5">
      <span className="font-display text-lg font-medium tabular-nums tracking-tight">
        ≈ {money(estimateMonth(w, volume).total)} ₽
      </span>
      <span className="text-[11px] text-muted-foreground">{t(T.perMonth)}</span>
    </p>
  );
}

function PriceCell({
  label,
  value,
  unit,
  accent = false,
}: {
  label: string;
  value: number;
  unit: string;
  accent?: boolean;
}) {
  return (
    <div className={cn("bg-card px-3.5 py-3", accent && "bg-primary/[0.05]")}>
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">
        <span
          className={cn(
            "font-display text-lg font-medium tabular-nums tracking-tight",
            accent && "text-primary",
          )}
        >
          {value}
        </span>
        <span className="ml-1 text-[10px] text-muted-foreground">{unit}</span>
      </dd>
    </div>
  );
}
