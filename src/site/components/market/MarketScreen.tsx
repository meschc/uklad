import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Loader2, Map as MapIcon, Rows3, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Filters } from "./Filters";
import { VolumeBar } from "./VolumeBar";
import { WarehouseCard } from "./WarehouseCard";
import { WAREHOUSES } from "../../data/warehouses";
import { EMPTY_VOLUME, type SellerVolume } from "../../lib/estimate";
import {
  DEFAULT_FILTERS,
  SORTS,
  activeCount,
  applyFilters,
  type MarketFilters,
  type SortId,
} from "../../lib/filters";
import { plural } from "../../lib/plural";
import { goWarehouse } from "../../lib/route";
import { useOverlay } from "../../lib/useOverlay";

/** Сколько карточек показывать до нажатия «Показать ещё». */
const PAGE = 12;

/**
 * Карта грузится отдельным куском, по нажатию.
 *
 * Leaflet со стилями весит больше, чем весь остальной сайт, и в общей сборке
 * он оказывался в куске, который тянут обе страницы, — то есть лендинг, где
 * карты нет вовсе, платил за неё полным весом.
 */
const MarketMap = lazy(() =>
  import("./MarketMap").then((m) => ({ default: m.MarketMap })),
);

/**
 * Витрина складов.
 *
 * Состояние отбора живёт здесь, а не в адресе: ссылка со всеми фильтрами
 * выглядит солидно, но её никто не пересылает. Пересылают ссылку на склад — и
 * у склада с недавних пор своя страница, так что пересылать есть что.
 */
export function MarketScreen() {
  const [filters, setFilters] = useState<MarketFilters>(DEFAULT_FILTERS);
  const [volume, setVolume] = useState<SellerVolume>(EMPTY_VOLUME);
  const [view, setView] = useState<"list" | "map">("list");
  const [limit, setLimit] = useState(PAGE);
  const [hovered, setHovered] = useState<string | undefined>();
  const [sheet, setSheet] = useState(false);

  const found = useMemo(() => applyFilters(WAREHOUSES, filters, volume), [filters, volume]);
  const active = activeCount(filters);

  // Новый отбор — снова первая страница. Иначе человек сужает фильтр и
  // остаётся в конце длинного списка, которого уже нет.
  useEffect(() => setLimit(PAGE), [filters]);

  // Шторка фильтров — такой же слой поверх страницы, как и карточка: Esc
  // закрывает, список под шторкой стоит на месте. Без этого палец на телефоне
  // прокручивает не фильтры, а каталог позади них.
  useOverlay(sheet, () => setSheet(false));

  const shown = found.slice(0, limit);

  const cards = shown.map((w) => (
    <WarehouseCard
      key={w.id}
      warehouse={w}
      highlighted={w.id === hovered}
      volume={volume}
    />
  ));

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-24 pt-28 sm:px-6 sm:pt-32">
      <header className="mb-8">
        <h1 className="font-display text-[30px] font-medium leading-[1.05] tracking-[-0.02em] sm:text-[40px]">
          Склады для фулфилмента
        </h1>
        {/* Не «честная занятость»: это оценка, которую читатель не может
            проверить. Проверить он может то, что лежит в карточке, — про это и
            пишем. Та же правка уже сделана в блоке витрины на лендинге. */}
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          Одинаковые карточки, одинаковый прайс, свободные места по каждому
          складу. Заявка на склад бесплатна — витрина не берёт комиссию с
          селлера.
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
              здесь считают. */}
          <VolumeBar value={volume} onChange={setVolume} />

          <div className="mb-5 mt-6 flex flex-wrap items-center gap-3">
            <p className="text-sm">
              <span className="font-display text-lg font-medium tabular-nums">
                {found.length}
              </span>{" "}
              <span className="text-muted-foreground">
                {plural(found.length, "склад", "склада", "складов")} по вашим условиям
              </span>
            </p>

            <button
              onClick={() => setSheet(true)}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-border px-3.5 text-xs font-medium lg:hidden"
            >
              <SlidersHorizontal className="size-3.5" />
              Фильтры{active > 0 && ` · ${active}`}
            </button>

            <div className="ml-auto flex items-center gap-2">
              <select
                value={filters.sort}
                onChange={(e) =>
                  setFilters({ ...filters, sort: e.target.value as SortId })
                }
                className="h-9 rounded-full border border-border bg-background px-3 text-xs outline-none focus:border-primary"
              >
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>

              {/* Пилюля в пилюле: переключатель вида — тот же приём, что и в
                  тарифах, только меньше. Внешняя рамка держит форму, внутренняя
                  ездит по ней. */}
              <div className="flex rounded-full border border-border p-0.5">
                <ViewBtn
                  on={view === "list"}
                  onClick={() => setView("list")}
                  label="Списком"
                >
                  <Rows3 className="size-3.5" />
                </ViewBtn>
                <ViewBtn
                  on={view === "map"}
                  onClick={() => setView("map")}
                  label="Карта"
                >
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
                    onClick={() => setLimit((n) => n + PAGE)}
                    className="inline-flex h-11 items-center rounded-full border border-border px-6 text-sm font-medium transition-colors hover:bg-muted"
                  >
                    Показать ещё {Math.min(PAGE, found.length - limit)}
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
                    onClick={() => setLimit((n) => n + PAGE)}
                    className="h-11 rounded-full border border-border text-sm font-medium transition-colors hover:bg-muted"
                  >
                    Показать ещё {Math.min(PAGE, found.length - limit)}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {sheet && (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-black/50"
            onClick={() => setSheet(false)}
          />
          <div className="absolute inset-y-0 right-0 flex w-[86%] max-w-sm animate-slide-in-right flex-col bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="font-display font-medium">Фильтры</span>
              <button
                onClick={() => setSheet(false)}
                aria-label="Закрыть"
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
              Показать {found.length}
            </button>
          </div>
        </div>
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
  return (
    <div className="r-window border border-dashed border-border py-20 text-center">
      <p className="font-display text-lg font-medium">Под такие условия склада нет</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
        Условия складываются друг с другом. Уберите площадку или поднимите
        потолок по цене — скорее всего, дело в них.
      </p>
      <button
        onClick={onReset}
        className="mt-5 inline-flex h-10 items-center rounded-full border border-border px-5 text-sm font-medium transition-colors hover:bg-muted"
      >
        Сбросить фильтры
      </button>
    </div>
  );
}
