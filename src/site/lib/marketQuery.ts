import { CITIES } from "../data/cities";
import { MARKETPLACES, SCHEMES, SERVICES } from "../data/marketplaces";
import type { SchemeId, ServiceId } from "../data/marketplaces";
import {
  DEFAULT_FILTERS,
  PRICE_MAX,
  PRICE_MIN,
  SORTS,
  type MarketFilters,
  type SortId,
} from "./filters";

/**
 * Отбор на витрине — в адресе страницы.
 *
 * Отбор складывается долго: город, две площадки, четыре услуги, потолок цены.
 * Пока он жил в состоянии экрана, показать результат было нечем — ссылка
 * `/market/` открывала у собеседника все шестьдесят три склада, и вместо неё
 * пересылали скриншот. Кнопка «назад» при этом уводила с витрины целиком,
 * хотя человек всего лишь хотел снять последний фильтр.
 *
 * Поэтому состояние отбора и есть адрес: экран его не хранит, а читает. Здесь
 * лежит перевод в обе стороны — и он единственный, кто знает имена параметров.
 *
 * Значения по умолчанию в адрес не пишутся: чистая витрина обязана открываться
 * по чистому `/market/`, иначе в индекс поисковика попадут десятки адресов с
 * одним и тем же содержимым.
 */

/** Имена параметров. Короткие: этот адрес пересылают в переписке. */
const P = {
  q: "q",
  city: "city",
  scheme: "scheme",
  marketplace: "mp",
  service: "service",
  price: "price",
  verified: "verified",
  uklad: "uklad",
  sort: "sort",
} as const;

/** Все имена, которыми распоряжается витрина. Остальные в адресе — чужие. */
const KEYS: readonly string[] = Object.values(P);

/**
 * Списки едут одним параметром через запятую (`mp=ozon,wildberries`), а не
 * повторами одного имени: повторы вчетверо длиннее и в переписке переносятся
 * посреди адреса.
 */
const LIST_SEPARATOR = ",";

/** Значение включённого переключателя. */
const ON = "1";

const CITY_NAMES: readonly string[] = CITIES.map((city) => city.name);
const SCHEME_IDS: readonly string[] = SCHEMES.map((s) => s.id);
const MARKETPLACE_IDS: readonly string[] = MARKETPLACES.map((m) => m.id);
const SERVICE_IDS: readonly string[] = SERVICES.map((s) => s.id);
const SORT_IDS: readonly string[] = SORTS.map((s) => s.id);

/**
 * Список из параметра: незнакомые значения выброшены, повторы схлопнуты.
 *
 * Адрес правят руками и режут при пересылке, так что мусор в нём — не
 * исключение, а обычное дело. Отвечать на него пустой витриной нельзя:
 * человек увидит «ничего не найдено» и решит, что складов нет.
 */
function readList<T extends string>(
  params: URLSearchParams,
  key: string,
  allowed: readonly string[],
): T[] {
  const raw = params.get(key);
  if (!raw) return [];
  const picked = raw.split(LIST_SEPARATOR).filter((value) => allowed.includes(value));
  return [...new Set(picked)] as T[];
}

/** Потолок цены: не число или мимо шкалы — значит потолка нет. */
function readPrice(params: URLSearchParams): number {
  const raw = params.get(P.price);
  if (raw === null) return PRICE_MAX;
  const price = Number(raw);
  if (!Number.isFinite(price)) return PRICE_MAX;
  return Math.min(PRICE_MAX, Math.max(PRICE_MIN, price));
}

/** Разбор адреса в условия отбора. Всё непонятное — как будто не задано. */
export function readFilters(search: string): MarketFilters {
  const params = new URLSearchParams(search);
  const city = params.get(P.city) ?? "";
  const sort = params.get(P.sort) ?? "";

  return {
    q: params.get(P.q) ?? DEFAULT_FILTERS.q,
    city: CITY_NAMES.includes(city) ? city : DEFAULT_FILTERS.city,
    schemes: readList<SchemeId>(params, P.scheme, SCHEME_IDS),
    marketplaces: readList<string>(params, P.marketplace, MARKETPLACE_IDS),
    services: readList<ServiceId>(params, P.service, SERVICE_IDS),
    maxStorage: readPrice(params),
    verifiedOnly: params.get(P.verified) === ON,
    ukladOnly: params.get(P.uklad) === ON,
    sort: SORT_IDS.includes(sort) ? (sort as SortId) : DEFAULT_FILTERS.sort,
  };
}

/**
 * Условия отбора строкой запроса — без ведущего `?` и без значений по
 * умолчанию.
 *
 * `URLSearchParams` кодирует запятую как `%2C`; здесь она возвращается на
 * место. Запятая в строке запроса разрешена, а адрес с четырьмя площадками
 * иначе перестаёт читаться глазами — а его именно глазами и читают, когда
 * получают в переписке.
 */
export function filtersQuery(f: MarketFilters): string {
  const params = new URLSearchParams();
  if (f.q) params.set(P.q, f.q);
  if (f.city) params.set(P.city, f.city);
  if (f.schemes.length) params.set(P.scheme, f.schemes.join(LIST_SEPARATOR));
  if (f.marketplaces.length) params.set(P.marketplace, f.marketplaces.join(LIST_SEPARATOR));
  if (f.services.length) params.set(P.service, f.services.join(LIST_SEPARATOR));
  if (f.maxStorage < PRICE_MAX) params.set(P.price, String(f.maxStorage));
  if (f.verifiedOnly) params.set(P.verified, ON);
  if (f.ukladOnly) params.set(P.uklad, ON);
  if (f.sort !== DEFAULT_FILTERS.sort) params.set(P.sort, f.sort);
  return params.toString().replace(/%2C/g, LIST_SEPARATOR);
}

/**
 * Новый адрес витрины: свои параметры переписаны, чужие оставлены как были.
 *
 * Чужие — это метки рекламных кампаний (`utm_*`) и всё, что к адресу
 * приписывают снаружи. Витрина про них ничего не знает, но и стирать их при
 * первом же клике по фильтру не вправе: пришедший по объявлению перестал бы
 * считаться пришедшим по объявлению, стоило ему выбрать город.
 */
export function marketSearch(search: string, f: MarketFilters): string {
  const foreign = new URLSearchParams(search);
  for (const key of KEYS) foreign.delete(key);
  const query = [foreign.toString(), filtersQuery(f)].filter(Boolean).join("&");
  return query ? `?${query}` : "";
}

/**
 * Плавная ли правка — та, что человек делает не разом.
 *
 * Строку поиска набирают посимвольно, ползунок цены ведут пикселями: каждое
 * такое движение — отдельное состояние отбора, и складывать их в историю
 * нельзя. Иначе «назад» после набранного слова из шести букв нужно нажать
 * шесть раз, и только седьмое нажатие уводит с витрины. Такие правки
 * заменяют текущую запись истории, а отметки, город и сортировка — добавляют
 * новую: их ставят по одной и по одной же снимают кнопкой «назад».
 */
export function isGradualChange(before: MarketFilters, after: MarketFilters): boolean {
  const steady = (f: MarketFilters) => filtersQuery({ ...f, q: "", maxStorage: PRICE_MAX });
  return steady(before) === steady(after);
}
