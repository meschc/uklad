import { useLayoutEffect, useRef } from "react";

/**
 * Плавная перестановка строк (приём FLIP). После каждого рендера сравниваем,
 * где строка стояла и где встала, и проигрываем сдвиг: строки разъезжаются,
 * освобождая место, а не прыгают. Строки помечаются `data-flip="<ключ>"`
 * внутри контейнера `ref`.
 */
export function useFlip<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const tops = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    // От верха контейнера, а не окна: прокрутка меню — не перестановка.
    const base = root.getBoundingClientRect().top - root.scrollTop;
    const next = new Map<string, number>();
    root.querySelectorAll<HTMLElement>("[data-flip]").forEach((el) => {
      const key = el.dataset.flip!;
      const top = el.getBoundingClientRect().top - base;
      next.set(key, top);
      const was = tops.current.get(key);
      if (was == null || Math.abs(was - top) < 1) return;
      el.style.transition = "none";
      el.style.transform = `translateY(${was - top}px)`;
      requestAnimationFrame(() => {
        el.style.transition = "transform 180ms cubic-bezier(0.2, 0, 0, 1)";
        el.style.transform = "";
      });
    });
    tops.current = next;
  });

  return ref;
}
