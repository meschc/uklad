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
 * Чтение обёрнуто в try: в приватном окне и при запрете хранилища обращение к
 * localStorage бросает исключение, и баннер уронил бы всю страницу.
 */
export function readChoice(): CookieChoice | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "all" || v === "necessary" ? v : null;
  } catch {
    return null;
  }
}

export function writeChoice(choice: CookieChoice): void {
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    // Хранилище недоступно — баннер просто появится в следующий раз. Это
    // неприятно, но честнее, чем считать согласие полученным без записи.
  }
}

export function openCookieSettings(): void {
  window.dispatchEvent(new Event(REOPEN_EVENT));
}
