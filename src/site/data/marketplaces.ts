/**
 * Площадки, под которые работает фулфилмент. Знак берётся из `public/brands` —
 * там же, где его берёт экран интеграций в приложении: один файл на весь
 * проект, чтобы витрина и продукт не разъезжались по логотипам.
 *
 * Логотип используется номинативно — обозначить, куда склад умеет отгружать.
 */
export interface MarketplaceRef {
  id: string;
  title: string;
  /** Имя файла в `public/brands`. Без него рисуется монограмма. */
  logo?: string;
  short: string;
  /**
   * Цвет подложки знака. Это не «фирменный цвет площадки вообще», а цвет
   * плашки в самом файле логотипа: плитка и знак обязаны совпасть тон в тон,
   * иначе на углах вылезает кант чужого цвета.
   */
  bg: string;
  /** Цвет монограммы, если знак не загрузился. По умолчанию белый. */
  fg?: string;
  /**
   * Знак нарисован без собственной подложки — одни фигуры на прозрачном. Такому
   * нужно поле на плитке, иначе он упрётся в её углы. У остальных подложка уже
   * внутри файла, и они кладутся во всю плитку.
   */
  glyphOnly?: boolean;
}

export const MARKETPLACES: MarketplaceRef[] = [
  { id: "wildberries", title: "Wildberries", logo: "wildberries.svg", short: "WB", bg: "#B324E8" },
  { id: "ozon", title: "Ozon", logo: "ozon.svg", short: "OZ", bg: "#005BFF" },
  {
    id: "yandex-market",
    title: "Яндекс Маркет",
    logo: "yandex-market.svg",
    short: "ЯМ",
    bg: "#FF5226",
  },
  { id: "megamarket", title: "Мегамаркет", logo: "megamarket.png", short: "ММ", bg: "#8654CC" },
  { id: "lamoda", title: "Lamoda", logo: "lamoda.svg", short: "LM", bg: "#000000" },
  {
    id: "avito",
    title: "Авито",
    logo: "avito.svg",
    short: "АВ",
    bg: "#FFFFFF",
    fg: "#00AAFF",
    glyphOnly: true,
  },
  // Знак — официальная иконка приложения AliExpress (сумка с галочкой), а не
  // словесный логотип: в кружке 28 px надпись нечитаема. Фон #FF2751 взят
  // пипеткой с самой иконки, чтобы подложка совпадала с картинкой.
  { id: "aliexpress", title: "AliExpress", logo: "aliexpress.png", short: "AE", bg: "#FF2751" },
];

export const MARKETPLACE_BY_ID: Record<string, MarketplaceRef> = Object.fromEntries(
  MARKETPLACES.map((m) => [m.id, m]),
);

/** Схема работы: кто хранит товар и кто его везёт покупателю. */
export const SCHEMES = [
  { id: "FBO", title: "FBO", hint: "Товар лежит на складе площадки" },
  { id: "FBS", title: "FBS", hint: "Товар лежит у вас, отгрузка по заказу" },
  { id: "DBS", title: "DBS", hint: "Доставку до покупателя везёт продавец" },
] as const;

export type SchemeId = (typeof SCHEMES)[number]["id"];

/**
 * Услуги фулфилмента — набор, по которому селлеры реально сравнивают склады
 * (маркировка, возвраты, фотостудия и так далее).
 */
export const SERVICES = [
  { id: "marking", title: "Маркировка" },
  { id: "picking", title: "Комплектация" },
  { id: "returns", title: "Приём возвратов" },
  { id: "reject", title: "Выбраковка" },
  { id: "photo", title: "Фотостудия" },
  { id: "crossdock", title: "Кросс-докинг" },
  { id: "pallet", title: "Паллетирование" },
  { id: "repack", title: "Переупаковка" },
  { id: "tags", title: "Крепление бирок" },
  { id: "shrink", title: "Термоусадка" },
  { id: "steam", title: "Отпаривание одежды" },
  { id: "fragile", title: "Хрупкий груз" },
  { id: "honest", title: "Честный знак" },
  { id: "pickup", title: "Забор от поставщика" },
] as const;

export type ServiceId = (typeof SERVICES)[number]["id"];

export const SERVICE_BY_ID: Record<string, { id: string; title: string }> =
  Object.fromEntries(SERVICES.map((s) => [s.id, s]));
