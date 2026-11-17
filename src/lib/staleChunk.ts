/**
 * Устаревшая вкладка после выкладки.
 *
 * Экраны кабинета грузятся отдельными кусками с хэшем в имени. После новой
 * выкладки старых кусков на сервере нет, и открытая со вчера вкладка падает
 * на первом же новом экране: Safari пишет «Importing a module script failed»,
 * Chrome — «Failed to fetch dynamically imported module» (Кирилл 18.11, «Что
 * это?» на телефоне). Лечится одной перезагрузкой: страница возьмёт новую
 * сборку. Данные не теряются — они в хранилище и на сервере, а не в вкладке.
 *
 * Перезагружаем не чаще раза в 10 с: если кусок не грузится по другой
 * причине (нет сети), бесконечного цикла перезагрузок не будет — покажется
 * обычная заглушка сбоя.
 */
const STALE =
  /Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Unable to preload CSS/i;

const KEY = "uklad.stale-chunk-reload";
const GAP_MS = 10_000;

export function isStaleChunk(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return STALE.test(message);
}

/** Перезагрузить страницу за новой сборкой; `false` — недавно уже пробовали. */
export function reloadForNewBuild(now = Date.now()): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (now - last < GAP_MS) return false;
    sessionStorage.setItem(KEY, String(now));
  } catch {
    // Нет sessionStorage (приватное окно) — перезагружаем без защиты от
    // повтора: заглушка после второй неудачи всё равно появится у границы.
  }
  window.location.reload();
  return true;
}
