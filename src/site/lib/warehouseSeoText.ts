import { MARKETPLACE_BY_ID, SERVICE_BY_ID } from "../data/marketplaces";
import { money, monthlyPerPlace, type Warehouse } from "../data/warehouses";
import type { TFunc } from "./copy";

/**
 * Текст для поиска внизу страницы склада (Кирилл 22 окт, по образцу Циана):
 * несколько строк, собранных из полей карточки, — город, адрес, площадь,
 * свободные места, схемы, площадки, услуги и базовые ставки. Человеку он
 * почти не нужен, поэтому стоит серым в самом низу; поисковику он отдаёт
 * запросы вида «аренда склада фулфилмента в Казани» словами, а не таблицей.
 *
 * Только данные карточки и никаких обещаний сверх них: текст пересобирается
 * сам при каждой правке склада и устареть отдельно от карточки не может.
 */
export function warehouseSeoText(t: TFunc, w: Warehouse): string[] {
  const ru = t.lang === "ru";
  const name = t(w.name);
  const city = t(w.cityTitle);
  const region = t(w.region);
  const where = region === city ? city : `${city} (${region})`;
  const list = (items: string[]) =>
    items.length < 2
      ? (items[0] ?? "")
      : `${items.slice(0, -1).join(", ")} ${ru ? "и" : "and"} ${items[items.length - 1]}`;

  const marketplaces = list(
    w.marketplaces
      .map((id) => MARKETPLACE_BY_ID[id])
      .filter(Boolean)
      .map((m) => t(m.title)),
  );
  const services = list(
    w.services
      .map((id) => SERVICE_BY_ID[id])
      .filter(Boolean)
      .map((s) => t(s.title).toLowerCase()),
  );
  const schemes = list(w.schemes.map(String));
  const p = w.price;
  const month = money(monthlyPerPlace(w));

  if (ru) {
    return [
      `На этой странице можно арендовать место на складе фулфилмента «${name}» в городе ${where}, ${t(w.address)}. ` +
        `Площадь склада — ${money(w.areaM2)} м², свободно ${money(w.cellsFree)} из ${money(w.cellsTotal)} мест хранения. ` +
        `Склад работает с ${w.since} года, оператор — ${t(w.legal)}` +
        (w.verified ? ", регистрация и право на помещение проверены Укладом." : "."),
      [
        schemes && `Схемы работы с маркетплейсами: ${schemes}.`,
        marketplaces && `Отгрузка на ${marketplaces}.`,
        services && `Услуги: ${services}.`,
      ]
        .filter(Boolean)
        .join(" "),
      `Хранение — ${money(p.storage)} ₽ за паллето-место в сутки, около ${month} ₽ в месяц; ` +
        `приёмка — ${money(p.receiving)} ₽ за короб, сборка заказа — ${money(p.picking)} ₽, ` +
        `маркировка — ${money(p.marking)} ₽ за единицу. ` +
        (w.minPlaces > 0
          ? `Минимальный объём — от ${w.minPlaces} мест. `
          : "Минимального объёма нет. ") +
        `Заявка на хранение и фулфилмент в городе ${city} бесплатна и без комиссии, ` +
        `склад отвечает в среднем за ${w.responseHours} ч.`,
    ].filter(Boolean);
  }

  return [
    `On this page you can rent fulfilment storage at “${name}” in ${where}, ${t(w.address)}. ` +
      `Floor area is ${money(w.areaM2)} m², ${money(w.cellsFree)} of ${money(w.cellsTotal)} storage slots are free. ` +
      `Operating since ${w.since}, run by ${t(w.legal)}` +
      (w.verified ? "; registration and premises verified by Uklad." : "."),
    [
      schemes && `Marketplace models: ${schemes}.`,
      marketplaces && `Ships to ${marketplaces}.`,
      services && `Services: ${services}.`,
    ]
      .filter(Boolean)
      .join(" "),
    `Storage is ${money(p.storage)} ₽ per pallet slot a day, about ${month} ₽ a month; ` +
      `intake ${money(p.receiving)} ₽ per box, picking ${money(p.picking)} ₽ per order, ` +
      `labelling ${money(p.marking)} ₽ per item. ` +
      (w.minPlaces > 0 ? `Minimum volume is ${w.minPlaces} slots. ` : "No minimum volume. ") +
      `A storage request in ${city} is free and commission-free; ` +
      `the warehouse replies in ${w.responseHours} h on average.`,
  ].filter(Boolean);
}
