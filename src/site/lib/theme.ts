import { useEffect } from "react";

/**
 * Тема витрины по настройке устройства.
 *
 * Переключателя на сайте нет намеренно. Тема здесь — не настройка продукта, а
 * ответ на вопрос «светло сейчас или темно», и ответ на него человек уже дал
 * один раз в системе. Второй переключатель в шапке лендинга — это ещё один
 * элемент управления на странице, где всё внимание должно уйти на кнопку
 * «Смотреть склады». В приложении по-другому: там тема живёт в профиле и
 * выбирается руками, потому что за экраном сидят целую смену.
 *
 * Первую установку класса делает не этот хук, а синхронный скрипт в
 * `index.html` — он успевает до отрисовки. Здесь только подписка на смену
 * настройки на ходу: у человека сработало системное расписание «тёмная после
 * заката», а вкладка с сайтом висит открытой со вчера.
 */

const LIGHT = "(prefers-color-scheme: light)";

/** Одна точка, где класс темы попадает на `html`. */
function applyTheme(isLight: boolean): void {
  const root = document.documentElement;
  root.classList.toggle("light", isLight);
  root.classList.toggle("dark", !isLight);
}

export function useSystemTheme(): void {
  useEffect(() => {
    const query = window.matchMedia(LIGHT);
    // Скрипт в `index.html` мог не выполниться (расширение, отключённый JS в
    // момент разбора) — синхронизируем класс перед подпиской, а не полагаемся
    // на то, что он уже верный.
    applyTheme(query.matches);

    const onChange = (e: MediaQueryListEvent) => applyTheme(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
}
