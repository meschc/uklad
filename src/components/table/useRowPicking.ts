import { useRef, useState } from "react";

/**
 * Отметки строк для групповых действий (#32).
 *
 * Отдельным хуком, а не полями экрана, из-за двух тонкостей, которые ломаются
 * молча и которые здесь проверены тестом: якорь Shift-диапазона и то, что
 * выделение живёт поверх фильтров.
 */
export function useRowPicking(visibleIds: readonly string[]) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  /** Последняя отмеченная строка — от неё Shift тянет диапазон. */
  const lastPicked = useRef<string | null>(null);

  const pickedVisible = visibleIds.filter((id) => picked.has(id));
  const allVisiblePicked = visibleIds.length > 0 && pickedVisible.length === visibleIds.length;
  const someVisiblePicked = pickedVisible.length > 0 && !allVisiblePicked;

  /**
   * Отметить строку. С Shift — диапазон от предыдущей отмеченной до текущей,
   * как в любой таблице и как выделение рядов на плане (п.3). Диапазон всегда
   * добавляет: Shift «дотягивает» выделение, а не переключает каждую строку.
   */
  const toggle = (id: string, range = false) => {
    // Якорь читаем ДО setPicked: обновление состояния выполняется в рендере,
    // а к тому моменту ref уже указывал бы на текущую строку — и диапазон
    // схлопывался бы в обычный клик.
    const from = lastPicked.current;
    lastPicked.current = id;
    setPicked((prev) => {
      const next = new Set(prev);
      if (range && from && from !== id) {
        const a = visibleIds.indexOf(from);
        const b = visibleIds.indexOf(id);
        if (a >= 0 && b >= 0) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          for (let i = lo; i <= hi; i++) next.add(visibleIds[i]);
          return next;
        }
      }
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /**
   * «Выделить всё» берёт только видимые строки, а отметки скрытых фильтром
   * товаров не теряются: человек сузил список, чтобы добрать нужное, а не
   * чтобы потерять набранное.
   */
  const toggleAllVisible = () =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (allVisiblePicked) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });

  const clear = () => setPicked(new Set());

  return { picked, toggle, toggleAllVisible, allVisiblePicked, someVisiblePicked, clear };
}
