import { useEffect, useRef } from "react";
import { setSmoothScrollPaused } from "./useSmoothScroll";

/**
 * Общее поведение всплывающих слоёв витрины: Esc закрывает, фон под слоем не
 * прокручивается. Иначе человек крутит колесо над модалкой, уезжает список
 * позади — и, закрыв карточку, оказывается не там, где был.
 *
 * Колбэк живёт в ref намеренно. Родители передают сюда стрелочные функции,
 * которые создаются заново на каждый рендер; если положить onClose в зависимости
 * эффекта, тот перезапустится и запомнит уже подменённое значение overflow —
 * страница останется заблокированной после закрытия слоя. Так эффект зависит
 * только от `active`, то есть срабатывает ровно на открытие и на закрытие.
 */
export function useOverlay(active: boolean, onClose: () => void): void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!active) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Спрятанной полосы мало: цель плавной прокрутки продолжала бы уезжать
    // сквозь модалку, и, закрыв её, человек оказался бы не там, где был.
    setSmoothScrollPaused(true);
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = prev;
      setSmoothScrollPaused(false);
      window.removeEventListener("keydown", onKey);
    };
  }, [active]);
}
