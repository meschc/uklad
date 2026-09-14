/**
 * Корень, из которого отдаётся витрина.
 *
 * Обычно это «/», но сборка умеет лежать и в подкаталоге (GitHub Pages без
 * своего домена отдаёт сайт по адресу вида `/uklad/`). Адреса страниц собираем
 * и разбираем только через эти две функции: иначе один забытый слэш в ссылке
 * уводит человека в корень чужого сайта, а разбор пути молча считает «uklad»
 * названием раздела и показывает «страница не найдена».
 */

/** Всегда с ведущей и завершающей косой чертой: «/» или «/uklad/». */
const BASE = normalize(import.meta.env.BASE_URL);

function normalize(base: string | undefined): string {
  if (!base || base === "./") return "/";
  const withLead = base.startsWith("/") ? base : `/${base}`;
  return withLead.endsWith("/") ? withLead : `${withLead}/`;
}

/** Путь без корня: «/uklad/market/» → «market/». */
export function stripBase(pathname: string): string {
  const path = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname;
  return path.replace(/^\/+/, "");
}

/** Путь с корнем: «market/» → «/uklad/market/». */
export function withBase(path: string): string {
  return `${BASE}${path.replace(/^\/+/, "")}`;
}
