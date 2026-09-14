import { useEffect, useMemo, useRef, useState } from "react";
import type { MarketFilters } from "./filters";
import { isGradualChange, marketSearch, readFilters } from "./marketQuery";
import { setSearch, useSearch } from "./route";

/**
 * Сколько ждать, прежде чем записать плавную правку в адрес.
 *
 * Не «чтобы не дёргалось»: браузер считает записи в историю и при частых
 * начинает их отбрасывать, а Safari после сотни за полминуты просто бросает
 * ошибку. Ползунок цены на одном протаскивании даёт этих записей больше сотни,
 * а строка поиска — по одной на букву. Треть секунды — обычная пауза между
 * словами: человек ещё набирает, а адрес уже не трогают.
 */
const SETTLE_MS = 300;

/** Не записанная в адрес правка — вместе с адресом, к которому она относится. */
interface Draft {
  search: string;
  filters: MarketFilters;
}

/**
 * Условия отбора витрины — из адреса и обратно в адрес.
 *
 * Экран получает пару «текущие условия, поменять условия» и живёт так, будто
 * это обычное состояние. На деле хранит их адрес: `/market/?city=Москва&mp=ozon`
 * можно переслать, положить в закладки и снять последнее условие кнопкой
 * «назад».
 *
 * Плавные правки — набор в поиске и ведение ползунка — показываются сразу, а в
 * адрес уезжают с выдержкой: до неё они живут черновиком. Иначе выбор между
 * «записывать каждую букву» и «показывать её с задержкой» пришлось бы делать
 * в пользу одного из двух, и оба варианта плохи.
 */
export function useMarketFilters(): [MarketFilters, (next: MarketFilters) => void] {
  const search = useSearch();
  const applied = useMemo(() => readFilters(search), [search]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  // Черновик подходит только к тому адресу, поверх которого его набрали.
  // Сменился адрес — черновик отпадает сам, и показываем то, что в адресе:
  // так «назад» снимает последнее условие, а записанная с выдержкой правка
  // бесшовно превращается в обычные условия отбора.
  //
  // Отдельного состояния «какой адрес был прошлый раз» для этого не нужно.
  // Оно тут и стояло — и правило его прямо в рендере, что и ломало отбор:
  // после такой правки React переставал считать, что хвост адреса поменялся,
  // и «назад» переписывал адрес, не трогая витрину.
  const filters = draft && draft.search === search ? draft.filters : applied;

  // Отложенную запись снимает уборка эффекта, а не сам рендер: рендер React
  // вправе бросить и повторить, а снятый таймер обратно не заводится. Эффект
  // привязан к адресу, поэтому уборка случается ровно тогда, когда адрес
  // поменялся или экран закрыли, — то есть когда ждать уже нечего.
  useEffect(() => stop, [search]);

  const change = (next: MarketFilters) => {
    stop();
    if (!isGradualChange(filters, next)) {
      setDraft(null);
      setSearch(marketSearch(search, next), "push");
      return;
    }
    setDraft({ search, filters: next });
    // Адрес читаем из окна, а не из снимка: между правкой и выдержкой человек
    // мог уйти на другую страницу и вернуться.
    timer.current = setTimeout(
      () => setSearch(marketSearch(window.location.search, next), "replace"),
      SETTLE_MS,
    );
  };

  return [filters, change];
}
