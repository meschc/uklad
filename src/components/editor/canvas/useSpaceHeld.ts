import { useEffect, useState } from "react";

/**
 * Зажатый пробел — временный режим панорамирования (как в графических
 * редакторах). Слушаем на окне, а не на холсте: рука тянется к пробелу, когда
 * фокус может быть на любой панели рядом.
 */

/** Поля ввода пробел забирают себе: там это символ, а не жест. */
const isField = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

export function useSpaceHeld(): boolean {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isField(e.target)) {
        // Иначе страница прокрутится, а фокусная кнопка «нажмётся».
        e.preventDefault();
        setHeld(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setHeld(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  return held;
}
