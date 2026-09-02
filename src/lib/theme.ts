import type { Theme } from "./types";

/**
 * Тема, с которой приложение открывается в самый первый раз.
 *
 * Дальше тему выбирает человек — переключатель есть и в рельсе, и в кабинете,
 * и в профиле, а выбор переживает перезагрузку вместе с остальным состоянием.
 * Система спрашивается ровно один раз, при первом запуске, и потом молчит: за
 * экраном склада сидят смену целиком, и подмена темы в середине смены, потому
 * что у ноутбука сработало расписание «тёмная после заката», — это не забота,
 * а сюрприз. На витрине наоборот: там человек проводит минуту, своего выбора у
 * него нет и быть не должно, поэтому она идёт за системой всегда — см.
 * `src/site/lib/theme.ts`.
 *
 * Раньше здесь стояла жёстко зашитая светлая. Она и осталась запасным
 * вариантом — на случай, когда спросить некого: тесты идут в node без `window`,
 * а `matchMedia` нет в совсем старых браузерах.
 */
export function systemTheme(): Theme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Фон страницы в hex — то же значение, что `--background` в `src/index.css`.
 * Нужен подложке браузера: `theme-color` не понимает переменные и читает
 * только готовый цвет.
 */
const BACKGROUND: Record<Theme, string> = {
  light: "#FFFFFF",
  dark: "#14151A",
};

/**
 * Единственное место, где тема попадает на документ: класс на `html` и цвет
 * подложки браузера.
 *
 * Ту же работу до первой отрисовки делает inline-скрипт в `app/index.html` —
 * повторить её там пришлось потому, что он выполняется раньше любых модулей.
 * Если меняете здесь класс или цвет — поправьте и там, рассинхрон проявится
 * вспышкой чужого цвета при перезагрузке.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const isDark = theme === "dark";
  root.classList.toggle("dark", isDark);
  root.classList.toggle("light", !isDark);

  const meta = document.getElementById("theme-color");
  if (meta instanceof HTMLMetaElement) meta.content = BACKGROUND[theme];
}
