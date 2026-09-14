import type { AppView, UserRole } from "./types";

/**
 * Прямая ссылка на экран системы.
 *
 * Экраны живут в состоянии, а не в адресе: у приложения один URL на все
 * семнадцать экранов, и для работы этого хватает — рельс всегда под рукой, а
 * человек возвращается туда, где остановился. Сослаться на конкретный экран
 * извне при этом было нечем: ни из карты продукта, ни из портфолио, ни из
 * переписки.
 *
 * Параметр `?view=` эту дырку закрывает, не превращая приложение в
 * маршрутизируемое: экраны по-прежнему живут в сторе, а адрес — их отражение.
 * Читается он при запуске, а дальше держится в согласии с открытым экраном
 * (см. `useDeepLink`), чтобы ссылку можно было скопировать из адресной строки
 * в любой момент, а не только сразу после перехода по чужой.
 *
 * Роль идёт вторым параметром, а не выводится из экрана. Вывести её можно было
 * бы из рельса, но рельс — React-компонент с иконками, а этот модуль обязан
 * оставаться чистым: тесты приложения ходят в node без jsdom. Кто ставит
 * ссылку, тот и знает роль — карта продукта разводит экраны по ролям в
 * отдельные колонки.
 */

/**
 * Все экраны приложения. Список повторяет тип `AppView` — типы до рантайма не
 * доживают, а параметр адреса проверять нужно именно в рантайме. `satisfies`
 * не даст сюда попасть тому, чего в типе нет; обратное направление (экран
 * добавили в тип, а сюда забыли) стережёт тест.
 */
export const APP_VIEWS = [
  "login",
  "dashboard",
  "editor",
  "profile",
  "receiving",
  "labels",
  "documents",
  "lookup",
  "integrations",
  "tasks",
  "picking",
  "staff",
  "analytics",
  "spec",
  "seller",
  "chat",
] as const satisfies readonly AppView[];

const USER_ROLES = ["warehouse", "seller"] as const satisfies readonly UserRole[];

export interface DeepLink {
  role: UserRole | null;
  view: AppView | null;
}

const ROLE_PARAM = "role";
const VIEW_PARAM = "view";
const HEATMAP_PARAM = "heatmap";

/**
 * Отдельное ли это окно тепловой карты (`window.open` из шапки кабинета).
 *
 * Живёт рядом с разбором ссылки, потому что это тот же самый вопрос к адресу:
 * что именно просили открыть. Окно карты — не кабинет, рельса в нём нет, и
 * писать в его адрес открытый экран нельзя.
 */
export function isHeatmapWindow(search: string): boolean {
  return new URLSearchParams(search).has(HEATMAP_PARAM);
}

/**
 * Разбирает `?role=&view=` из строки запроса.
 *
 * Всё незнакомое молча превращается в `null`. Ошибка здесь была бы ошибкой не
 * человека, а того, кто поставил ссылку: встречать кладовщика сообщением о
 * кривом параметре незачем — правильное поведение при мусоре в адресе то же,
 * что и при пустом адресе, то есть открыть последний экран.
 */
export function parseDeepLink(search: string): DeepLink {
  const params = new URLSearchParams(search);
  const view = params.get(VIEW_PARAM);
  const role = params.get(ROLE_PARAM);
  return {
    role: (USER_ROLES as readonly string[]).includes(role ?? "") ? (role as UserRole) : null,
    view: (APP_VIEWS as readonly string[]).includes(view ?? "") ? (view as AppView) : null,
  };
}

/**
 * Обратная сборка: открытый экран — в строку запроса.
 *
 * Чужие параметры адреса остаются как были. Их два рода, и оба терять нельзя:
 * `?heatmap=1` — признак отдельного окна тепловой карты, без него это окно
 * при первом же переходе перестало бы быть собой; `utm_*` и прочие метки
 * ставят снаружи, и рельс не вправе стирать то, откуда человек пришёл.
 */
export function deepLinkSearch(search: string, link: DeepLink): string {
  const params = new URLSearchParams(search);
  if (link.role) params.set(ROLE_PARAM, link.role);
  else params.delete(ROLE_PARAM);
  if (link.view) params.set(VIEW_PARAM, link.view);
  else params.delete(VIEW_PARAM);
  const query = params.toString();
  return query ? `?${query}` : "";
}
