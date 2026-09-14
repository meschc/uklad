/**
 * Площадки, под которые работает фулфилмент. Знак берётся из `public/brands` —
 * там же, где его берёт экран интеграций в приложении: один файл на весь
 * проект, чтобы витрина и продукт не разъезжались по логотипам.
 *
 * Логотип используется номинативно — обозначить, куда склад умеет отгружать.
 */
import { c, type Copy } from "../lib/copy";

export interface MarketplaceRef {
  id: string;
  title: Copy;
  /** Имя файла в `public/brands`. Без него рисуется монограмма. */
  logo?: string;
  /**
   * Монограмма на случай, если знак не загрузился. Одноязычная намеренно: две
   * буквы кириллицей в английской версии — мелочь, которую увидит только тот,
   * у кого отвалился SVG, а вторая таблица ради неё живёт вечно.
   */
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
  {
    id: "wildberries",
    title: c("Wildberries", "Wildberries"),
    logo: "wildberries.svg",
    short: "WB",
    bg: "#B324E8",
  },
  { id: "ozon", title: c("Ozon", "Ozon"), logo: "ozon.svg", short: "OZ", bg: "#005BFF" },
  {
    id: "yandex-market",
    // Названия площадок не переводятся, а передаются так, как их пишет сама
    // площадка в своей английской версии.
    title: c("Яндекс Маркет", "Yandex Market"),
    logo: "yandex-market.svg",
    short: "ЯМ",
    bg: "#FF5226",
  },
  {
    id: "megamarket",
    title: c("Мегамаркет", "Megamarket"),
    logo: "megamarket.png",
    short: "ММ",
    bg: "#8654CC",
  },
  { id: "lamoda", title: c("Lamoda", "Lamoda"), logo: "lamoda.svg", short: "LM", bg: "#000000" },
  {
    id: "avito",
    title: c("Авито", "Avito"),
    logo: "avito.svg",
    short: "АВ",
    bg: "#FFFFFF",
    fg: "#00AAFF",
    glyphOnly: true,
  },
  // Знак — официальная иконка приложения AliExpress (сумка с галочкой), а не
  // словесный логотип: в кружке 28 px надпись нечитаема. Фон #FF2751 взят
  // пипеткой с самой иконки, чтобы подложка совпадала с картинкой.
  {
    id: "aliexpress",
    title: c("AliExpress", "AliExpress"),
    logo: "aliexpress.png",
    short: "AE",
    bg: "#FF2751",
  },
];

export const MARKETPLACE_BY_ID: Record<string, MarketplaceRef> = Object.fromEntries(
  MARKETPLACES.map((m) => [m.id, m]),
);

/**
 * Схема работы: кто хранит товар и кто его везёт покупателю.
 *
 * Названия не двуязычные: FBO, FBS и DBS — сокращения от английских фраз, и
 * по-русски их пишут ровно так же. Переводится только пояснение.
 */
export const SCHEMES = [
  {
    id: "FBO",
    title: "FBO",
    hint: c("Товар лежит на складе площадки", "Goods sit in the marketplace's warehouse"),
  },
  {
    id: "FBS",
    title: "FBS",
    hint: c("Товар лежит у вас, отгрузка по заказу", "Goods sit with you, shipped per order"),
  },
  {
    id: "DBS",
    title: "DBS",
    hint: c("Доставку до покупателя везёт продавец", "The seller delivers to the buyer"),
  },
] as const;

export type SchemeId = (typeof SCHEMES)[number]["id"];

/**
 * Услуги фулфилмента — набор, по которому селлеры реально сравнивают склады
 * (маркировка, возвраты, фотостудия и так далее).
 */
export const SERVICES = [
  { id: "marking", title: c("Маркировка", "Labelling") },
  { id: "picking", title: c("Комплектация", "Picking") },
  { id: "returns", title: c("Приём возвратов", "Returns intake") },
  { id: "reject", title: c("Выбраковка", "Reject sorting") },
  { id: "photo", title: c("Фотостудия", "Photo studio") },
  { id: "crossdock", title: c("Кросс-докинг", "Cross-docking") },
  { id: "pallet", title: c("Паллетирование", "Palletising") },
  { id: "repack", title: c("Переупаковка", "Repacking") },
  { id: "tags", title: c("Крепление бирок", "Tag attaching") },
  { id: "shrink", title: c("Термоусадка", "Shrink wrapping") },
  { id: "steam", title: c("Отпаривание одежды", "Garment steaming") },
  { id: "fragile", title: c("Хрупкий груз", "Fragile goods") },
  // «Честный знак» — имя собственное российской системы маркировки, у неё нет
  // английского названия: в документах на английском она так и идёт
  // транслитерацией.
  { id: "honest", title: c("Честный знак", "Chestny Znak") },
  { id: "pickup", title: c("Забор от поставщика", "Pickup from supplier") },
] as const;

export type ServiceId = (typeof SERVICES)[number]["id"];

export const SERVICE_BY_ID: Record<string, { id: string; title: Copy }> = Object.fromEntries(
  SERVICES.map((s) => [s.id, s]),
);
