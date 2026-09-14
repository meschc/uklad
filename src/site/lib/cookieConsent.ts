import { useSyncExternalStore } from "react";
import { readLocal, writeLocal } from "@/lib/safeStorage";

const KEY = "uklad.cookie-consent";

/** Событие, которым подвал просит баннер показаться снова. */
export const REOPEN_EVENT = "uklad:cookie-settings";

export type CookieChoice = "all" | "necessary";

/**
 * Выбор в баннере cookie.
 *
 * Хранится в localStorage, а не в самих cookie: выбор нужен только браузеру,
 * который его сделал, отправлять его на сервер незачем — а раз незачем, то и
 * не отправляем. Тем более что баннер, который сам себя записывает в cookie
 * до получения согласия, выглядит сомнительно.
 *
 * Хранилище может быть недоступно (см. `lib/safeStorage`) — тогда баннер
 * просто появится в следующий раз. Это неприятно, но честнее, чем считать
 * согласие полученным без записи.
 */
export function readChoice(): CookieChoice | null {
  const v = readLocal(KEY);
  return v === "all" || v === "necessary" ? v : null;
}

export function writeChoice(choice: CookieChoice): void {
  writeLocal(KEY, choice);
}

export function openCookieSettings(): void {
  window.dispatchEvent(new Event(REOPEN_EVENT));
}

/**
 * Открыт ли баннер прямо сейчас.
 *
 * Знать это нужно не только ему самому: у низа экрана один этаж, и всё, что
 * туда садится, обязано уступить баннеру место, пока выбор не сделан. Поэтому
 * признак живёт модулем, а не состоянием внутри `CookieBar`.
 */
let bannerOpen = false;
const listeners = new Set<() => void>();

export function setCookieBannerOpen(open: boolean): void {
  if (open === bannerOpen) return;
  bannerOpen = open;
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** На сборке баннера нет: он появляется по таймеру уже в браузере. */
export function useCookieBannerOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => bannerOpen,
    () => false,
  );
}
