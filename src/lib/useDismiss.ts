import { useEffect, type RefObject } from "react";

/**
 * Закрыть выпадающий список кликом мимо или клавишей Escape. Один хук на все
 * списки: раньше каждый повторял эти же полтора десятка строк и они могли
 * разойтись (один закрывается по Escape, другой нет).
 */
export function useDismiss(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
  onDismiss: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (
        e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)
      )
        onDismiss();
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
    // `onDismiss` у вызывающих — `setOpen(false)`: пересоздавать подписку на
    // каждую перерисовку незачем.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ref]);
}
