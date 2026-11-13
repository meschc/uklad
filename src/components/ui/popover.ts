import { useEffect, useState, type RefObject } from "react";

/** Где рисовать всплывающее меню: от кнопки, в координатах окна. */
export interface PopoverPlace {
  left: number;
  top: number;
  width: number;
  /** Снизу места мало — меню раскрывается вверх от кнопки. */
  up: boolean;
}

/**
 * Общая механика всплывающих меню ДС (выпадающий список, календарь).
 *
 * Меню рисуется в `document.body` и прибито к окну: внутри боковой панели с
 * прокруткой оно иначе обрезалось бы краем. Поэтому закрывается при прокрутке
 * снаружи меню и смене размера окна — иначе отстало бы от кнопки. Клик мимо
 * кнопки и меню тоже закрывает.
 */
export function useAnchoredPopover(
  trigger: RefObject<HTMLElement | null>,
  menu: RefObject<HTMLElement | null>,
  /** Сколько места нужно меню снизу, прежде чем раскрываться вверх. */
  need = 240,
) {
  const [place, setPlace] = useState<PopoverPlace>();
  const open = place !== undefined;
  const close = () => setPlace(undefined);

  // Место считаем в момент открытия: меню сразу встаёт под кнопку, без кадра
  // в углу и без пересчёта в эффекте.
  const show = () => {
    const el = trigger.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    const up = below < need && r.top > below;
    setPlace({ left: r.left, width: r.width, up, top: up ? r.top : r.bottom });
  };

  useEffect(() => {
    if (!open) return;
    const inside = (t: EventTarget | null) =>
      Boolean(trigger.current?.contains(t as Node) || menu.current?.contains(t as Node));
    const hide = () => setPlace(undefined);
    const outside = (e: Event) => !inside(e.target) && hide();
    const scroll = (e: Event) => !menu.current?.contains(e.target as Node) && hide();
    document.addEventListener("mousedown", outside);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", hide);
    return () => {
      document.removeEventListener("mousedown", outside);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", hide);
    };
  }, [open, trigger, menu]);

  return { open, place, show, close, toggle: () => (open ? close() : show()) };
}

/** Стиль позиции меню под кнопкой (или над ней). */
export function popoverStyle(place: PopoverPlace, minWidth = true): React.CSSProperties {
  return {
    left: Math.min(place.left, window.innerWidth - 16 - 280),
    ...(minWidth ? { minWidth: place.width } : {}),
    ...(place.up ? { bottom: window.innerHeight - place.top + 4 } : { top: place.top + 4 }),
  };
}

/** Классы панели всплывающего меню — одни на все меню ДС. */
export const POPOVER_PANEL =
  "fixed z-[60] animate-expand-in rounded-lg bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-border";
