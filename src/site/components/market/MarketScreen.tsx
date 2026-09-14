import { Suspense, lazy, useMemo, useState } from "react";
import { Loader2, Map as MapIcon, Rows3, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CompareBar } from "./CompareBar";
import { CompareSheet } from "./CompareSheet";
import { Filters } from "./Filters";
import { VolumeBar } from "./VolumeBar";
import { WarehouseCard } from "./WarehouseCard";
import { warehousesRepository } from "../../data/warehousesRepository";
import { COMPARE_LIMIT, comparedWarehouses, toggleCompare } from "../../lib/compare";
import { EMPTY_VOLUME, estimateRange, type SellerVolume } from "../../lib/estimate";
import { DEFAULT_FILTERS, SORTS, activeCount, type SortId } from "../../lib/filters";
import { filtersQuery } from "../../lib/marketQuery";
import { c, useT } from "../../lib/copy";
import { goWarehouse } from "../../lib/route";
import { useMarketFilters } from "../../lib/useMarketFilters";
import { useOverlay } from "../../lib/useOverlay";

/** Сколько карточек показывать до нажатия «Показать ещё». */
const PAGE = 12;

/** Докрученная длина списка — вместе с отбором, к которому она относится. */
interface Paging {
  key: string;
  limit: number;
}

const T = {
  title: c("Склады для фулфилмента", "Fulfilment warehouses"),
  lead: c(
    "Одинаковые карточки и прайс, свободные места по каждому складу. Заявка бесплатна: витрина не берёт комиссию с селлера.",
    "The same card and the same price list for everyone, free slots per warehouse. Requests are free: we take no seller commission.",
  ),
  badge: c(
    "Галочка на карточке значит ровно одно: Уклад сверил регистрацию компании и право на помещение. Как склад работает, она не оценивает — про это отзывы.",
    "A check mark on a card means exactly one thing: Uklad verified the company registration and the right to use the premises. It says nothing about how the warehouse works — that is what reviews are for.",
  ),
  found: c("по вашим условиям", "match your filters"),
  filters: c("Фильтры", "Filters"),
  list: c("Списком", "List"),
  map: c("Карта", "Map"),
  more: c("Показать ещё {n}", "Show {n} more"),
  close: c("Закрыть", "Close"),
  show: c("Показать {n}", "Show {n}"),
  emptyTitle: c("Под такие условия склада нет", "No warehouse fits these filters"),
  emptyBody: c(
    "Условия складываются. Уберите площадку или поднимите потолок цены — скорее всего, дело в них.",
    "Filters add up. Drop a marketplace or raise the price ceiling — that is usually the cause.",
  ),
  emptyReset: c("Сбросить фильтры", "Reset filters"),
};

/**
 * Карта грузится отдельным куском, по нажатию.
 *
 * Leaflet со стилями весит больше, чем весь остальной сайт, и в общей сборке
 * он оказывался в куске, который тянут обе страницы, — то есть лендинг, где
 * карты нет вовсе, платил за неё полным весом.
 */
const MarketMap = lazy(() => import("./MarketMap").then((m) => ({ default: m.MarketMap })));

/**
 * Витрина складов.
 *
 * Состояние отбора живёт в адресе, а не здесь: экран его читает и пишет, но не
 * хранит (`lib/useMarketFilters`). Собранный отбор — это и есть ответ на вопрос
 * «покажи, из чего ты выбираешь», и пересылать его нужно ссылкой, а не
 * скриншотом.
 *
 * Всё остальное — объём, вид, отметки к сравнению — остаётся состоянием
 * экрана: это не то, что показывают другому, а то, чем считают для себя.
 */
export function MarketScreen() {
  const t = useT();
  const [filters, setFilters] = useMarketFilters();
  const [volume, setVolume] = useState<SellerVolume>(EMPTY_VOLUME);
  const [view, setView] = useState<"list" | "map">("list");
  const [paging, setPaging] = useState<Paging>({ key: "", limit: PAGE });
  const [hovered, setHovered] = useState<string | undefined>();
  const [sheet, setSheet] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);

  // Отбор идёт через репозиторий: сегодня это фильтр по массиву в браузере,
  // завтра — запрос к API, и менять придётся один файл, а не этот экран.
  const found = useMemo(() => warehousesRepository.search(filters, volume), [filters, volume]);
  const active = activeCount(filters);

  // Вилка месяца — по найденному, а не по всему каталогу: панель отвечает про
  // тот список, который человек сейчас видит.
  const range = useMemo(() => estimateRange(found, volume), [found, volume]);

  // Новый отбор — снова первая страница. Иначе человек сужает фильтр и
  // остаётся в конце длинного списка, которого уже нет.
  //
  // Длина списка помнит, к какому отбору она относится, и к чужому просто не
  // подходит. Раньше вместо этого стояла правка состояния прямо в рендере —
  // и она ломала отбор целиком: на повторном проходе React выбрасывает
  // очередь эффектов, вместе с ней теряется отметка о прочитанном хвосте
  // адреса, и «назад» переписывал адрес, не трогая витрину.
  //
  // Сверяемся со строкой условий, а не с объектом: строка сравнима сама с
  // собой, а объект приезжает то из адреса, то из черновика.
  const key = filtersQuery(filters);
  const limit = paging.key === key ? paging.limit : PAGE;
  const showMore = () => setPaging({ key, limit: limit + PAGE });

  // Шторка фильтров — такой же слой поверх страницы, как и карточка: Esc
  // закрывает, список под шторкой стоит на месте. Без этого палец на телефоне
  // прокручивает не фильтры, а каталог позади них.
  useOverlay(sheet, () => setSheet(false));

  // Отмеченные ищутся по всему каталогу, а не по текущей выдаче. Иначе склад,
  // выпавший из выдачи после того, как человек сузил фильтр, молча пропал бы и
  // из сравнения — вместе с тем, ради чего его туда клали.
  const compared = useMemo(
    () => comparedWarehouses(warehousesRepository.list(), selected),
    [selected],
  );

  const toggle = (id: string) => setSelected(toggleCompare(selected, id));

  // Убирая склады из полосы, до сравнения можно доубираться: таблица из одной
  // колонки — не таблица, и слой закрывается сам, а не показывает пустоту.
  const drop = (id: string) => {
    const next = selected.filter((x) => x !== id);
    setSelected(next);
    if (next.length < 2) setCompareOpen(false);
  };

  const clearCompare = () => {
    setSelected([]);
    setCompareOpen(false);
  };

  const shown = found.slice(0, limit);

  const cards = shown.map((w) => (
    <WarehouseCard
      key={w.id}
      warehouse={w}
      highlighted={w.id === hovered}
      volume={volume}
      compared={selected.includes(w.id)}
      compareFull={selected.length >= COMPARE_LIMIT}
      onCompare={toggle}
    />
  ));

  return (
    <div
      className={cn(
        "mx-auto max-w-[1400px] px-4 pt-28 sm:px-6 sm:pt-32",
        // Полоса сравнения висит над страницей и накрывает её низ — вместе с
        // кнопкой «Показать ещё». Пока полосы нет, лишний отступ не нужен.
        selected.length > 0 ? "pb-44 sm:pb-32" : "pb-24",
      )}
    >
      <header className="mb-8">
        <h1 className="font-display text-[30px] font-medium leading-[1.05] tracking-[-0.02em] sm:text-[40px]">
          {t(T.title)}
        </h1>
        {/* Не «честная занятость»: это оценка, которую читатель не может
            проверить. Проверить он может то, что лежит в карточке, — про это и
            пишем. Та же правка уже сделана в блоке витрины на лендинге. */}
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          {t(T.lead)}
        </p>
        {/* Что означает галочка — словами и один раз на список, а не подписью
            под каждой карточкой. В коде `Warehouse.verified` описан честно, но
            селлер кода не читает и видит только значок, который сам по себе
            читается как «ручаемся за качество». Ручаться за качество склада
            витрина не может и не должна: для этого есть отзывы и жалобы. */}
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
          {t(T.badge)}
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[264px_minmax(0,1fr)] lg:gap-10">
        <aside className="hidden lg:block">
          <div className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto pb-6 pr-1">
            <Filters value={filters} onChange={setFilters} />
          </div>
        </aside>

        <div className="min-w-0">
          {/* Панель объёма — над списком, а не в колонке фильтров: она не
              сужает выдачу, а меняет то, что в ней написано. Слева отбирают,
              здесь считают. Одного переноса для этого не хватило — панель
              выглядит и отвечает иначе, чем отбор; разбор в `VolumeBar`. */}
          <VolumeBar value={volume} range={range} onChange={setVolume} />

          <div className="mb-5 mt-6 flex flex-wrap items-center gap-3">
            <p className="text-sm">
              <span className="font-display text-lg font-medium tabular-nums">{found.length}</span>{" "}
              <span className="text-muted-foreground">
                {t.plural(
                  found.length,
                  ["склад", "склада", "складов"],
                  ["warehouse", "warehouses"],
                )}{" "}
                {t(T.found)}
              </span>
            </p>

            <button
              onClick={() => setSheet(true)}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-border px-3.5 text-xs font-medium lg:hidden"
            >
              <SlidersHorizontal className="size-3.5" />
              {t(T.filters)}
              {active > 0 && ` · ${active}`}
            </button>

            <div className="ml-auto flex items-center gap-2">
              <select
                value={filters.sort}
                onChange={(e) => setFilters({ ...filters, sort: e.target.value as SortId })}
                className="h-9 rounded-full border border-border bg-background px-3 text-xs outline-none focus:border-primary"
              >
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {t(s.title)}
                  </option>
                ))}
              </select>

              {/* Пилюля в пилюле: переключатель вида — тот же приём, что и в
                  тарифах, только меньше. Внешняя рамка держит форму, внутренняя
                  ездит по ней. */}
              <div className="flex rounded-full border border-border p-0.5">
                <ViewBtn on={view === "list"} onClick={() => setView("list")} label={t(T.list)}>
                  <Rows3 className="size-3.5" />
                </ViewBtn>
                <ViewBtn on={view === "map"} onClick={() => setView("map")} label={t(T.map)}>
                  <MapIcon className="size-3.5" />
                </ViewBtn>
              </div>
            </div>
          </div>

          {found.length === 0 ? (
            <Empty onReset={() => setFilters(DEFAULT_FILTERS)} />
          ) : view === "list" ? (
            <>
              <div className="grid gap-4 xl:grid-cols-2">{cards}</div>
              {limit < found.length && (
                <div className="mt-8 text-center">
                  <button
                    onClick={showMore}
                    className="inline-flex h-11 items-center rounded-full border border-border px-6 text-sm font-medium transition-colors hover:bg-muted"
                  >
                    {t(T.more, { n: Math.min(PAGE, found.length - limit) })}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
              <div className="r-window h-[52vh] overflow-hidden border border-border lg:sticky lg:top-24 lg:h-[calc(100vh-9rem)]">
                <Suspense
                  fallback={
                    <div className="grid h-full place-items-center bg-muted/30">
                      <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    </div>
                  }
                >
                  <MarketMap
                    list={found}
                    activeId={hovered}
                    onHover={setHovered}
                    onOpen={goWarehouse}
                  />
                </Suspense>
              </div>
              {/* `auto-rows-max` здесь обязателен, иначе карточки схлопываются
                  в полоски по 45 пикселей — одни обложки без текста. Причина
                  складывается из двух: у карточки `overflow-hidden`, поэтому её
                  автоматическая минимальная высота равна нулю, а у колонки
                  задан потолок высоты — значит, места у сетки ровно 734
                  пикселя, и она делит их между строками поровну, ни одна из
                  которых до своей высоты по содержимому не дорастает. С
                  высотой строк по содержимому колонка начинает прокручиваться,
                  как и задумано. Колонка флексов ломается так же и по той же
                  причине: `flex-shrink` жмёт карточки до нуля. */}
              <div className="grid auto-rows-max content-start gap-3 lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto lg:pr-1">
                {cards}
                {limit < found.length && (
                  <button
                    onClick={showMore}
                    className="h-11 rounded-full border border-border text-sm font-medium transition-colors hover:bg-muted"
                  >
                    {t(T.more, { n: Math.min(PAGE, found.length - limit) })}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {sheet && (
        <div className="fixed inset-0 z-[70] lg:hidden">
          {/* Затемнение — фон, а не элемент управления: для скринридера оно
              скрыто, а закрыть панель с клавиатуры даёт useOverlay (Escape) и
              кнопка с крестиком ниже. */}
          <div
            aria-hidden
            className="absolute inset-0 animate-fade-in bg-black/50"
            onClick={() => setSheet(false)}
          />
          <div className="absolute inset-y-0 right-0 flex w-[86%] max-w-sm animate-slide-in-right flex-col bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="font-display font-medium">{t(T.filters)}</span>
              <button
                onClick={() => setSheet(false)}
                aria-label={t(T.close)}
                className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <Filters value={filters} onChange={setFilters} />
            </div>
            <button
              onClick={() => setSheet(false)}
              className="m-4 h-11 rounded-full bg-primary text-sm font-medium text-primary-foreground"
            >
              {t(T.show, { n: found.length })}
            </button>
          </div>
        </div>
      )}

      <CompareBar
        list={compared}
        onRemove={drop}
        onClear={clearCompare}
        onOpen={() => setCompareOpen(true)}
      />

      {compareOpen && (
        <CompareSheet
          list={compared}
          volume={volume}
          onRemove={drop}
          onClose={() => setCompareOpen(false)}
        />
      )}
    </div>
  );
}

function ViewBtn({
  on,
  onClick,
  label,
  children,
}: {
  on: boolean;
  onClick: () => void;
  /** Подпись кнопки; на телефоне остаётся только в доступном имени. */
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
        on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
      {/* На телефоне подписи прячутся: ряд «сортировка + переключатель» не
          влезал в 375px и растягивал всю страницу по горизонтали — вместе с
          фиксированной шапкой. Иконки различимы и без слов, а имя кнопки
          живёт в `aria-label`, так что для чтения с экрана ничего не пропало. */}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function Empty({ onReset }: { onReset: () => void }) {
  const t = useT();

  return (
    <div className="r-window border border-dashed border-border py-20 text-center">
      <p className="font-display text-lg font-medium">{t(T.emptyTitle)}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{t(T.emptyBody)}</p>
      <button
        onClick={onReset}
        className="mt-5 inline-flex h-10 items-center rounded-full border border-border px-5 text-sm font-medium transition-colors hover:bg-muted"
      >
        {t(T.emptyReset)}
      </button>
    </div>
  );
}
