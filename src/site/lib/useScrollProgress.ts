import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Насколько блок пройден скроллом: 0 — только показался снизу, 1 — ушёл вверх.
 *
 * Считается от центра экрана, а не от верхней кромки: линия прогресса должна
 * догорать примерно там, куда человек смотрит, иначе она либо заполняется
 * раньше, чем он дочитал шаги, либо отстаёт на пол-экрана.
 *
 * Пересчёт — в `requestAnimationFrame`: обработчик скролла, который читает
 * `getBoundingClientRect` на каждое событие, заставляет браузер пересчитывать
 * layout десятки раз в секунду.
 */
export function useScrollProgress<T extends HTMLElement>(): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;

    const measure = () => {
      frame = 0;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const mid = window.innerHeight * 0.55;
      const raw = (mid - rect.top) / Math.max(1, rect.height);
      setProgress(Math.min(1, Math.max(0, raw)));
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return [ref, progress];
}
