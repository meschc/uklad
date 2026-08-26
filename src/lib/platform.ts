/**
 * Определение платформы для подписей горячих клавиш. Пользуются и справка «?»,
 * и инспектор: на macOS показываем ⌘/⌥/⌫/⇧, на Windows и Linux — Ctrl/Alt/Del/Shift.
 */
export const IS_MAC =
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent);

export const MOD_KEY = IS_MAC ? "⌘" : "Ctrl";
export const ALT_KEY = IS_MAC ? "⌥" : "Alt";
export const DEL_KEY = IS_MAC ? "⌫" : "Del";
export const SHIFT_KEY = IS_MAC ? "⇧" : "Shift";

/** Компактная запись сочетания: «⌘D» на маке, «Ctrl+D» на остальных. */
export function combo(key: string): string {
  return IS_MAC ? `${MOD_KEY}${key}` : `${MOD_KEY}+${key}`;
}

/** То же с Shift: «⇧⌘Z» на маке, «Ctrl+Shift+Z» на остальных. */
export function shiftCombo(key: string): string {
  return IS_MAC
    ? `${SHIFT_KEY}${MOD_KEY}${key}`
    : `${MOD_KEY}+${SHIFT_KEY}+${key}`;
}
