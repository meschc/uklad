import { useSyncExternalStore } from "react";

/**
 * Телефон — та же граница, что у нижней панели кабинета (`md`, 768 px).
 * Нужна там, где на телефоне меняется не вёрстка, а поведение: план склада
 * на телефоне только смотрят, правят его на компьютере (согласовано 16.11).
 */
const QUERY = "(max-width: 767.98px)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function snapshot(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(QUERY).matches
    : false;
}

export function usePhone(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
