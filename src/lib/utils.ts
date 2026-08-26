import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Ограничить число диапазоном [min, max]. */
export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Короткий уникальный id для сущностей прототипа. */
export function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Стабильная пустая ссылка для селекторов стора: `s.x ?? []` возвращал бы новый
 * массив на каждый рендер, и подписка считала бы состояние изменившимся.
 */
export const EMPTY_ARRAY: never[] = [];
