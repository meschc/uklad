import { c, type Copy } from "../lib/copy";

/**
 * География витрины. Координаты — центры городов; конкретные склады
 * разбрасываются вокруг них (см. `warehouses.ts`), потому что настоящий
 * фулфилмент стоит не на главной площади, а на выезде.
 *
 * `weight` — сколько складов приходится на город. Это не выдумка ради красивой
 * карты: рынок фулфилмента действительно стянут к Москве и Подмосковью, где
 * стоят приёмные центры маркетплейсов, и равномерная россыпь по стране врала бы
 * селлеру о том, что он видит.
 */
/**
 * Названия городов и областей на английской витрине транслитерируются, а не
 * переводятся заново: «Yekaterinburg» — то же место, что и «Екатеринбург», и
 * англоязычный селлер найдёт его в справочнике перевозчика именно так. Ключом
 * при этом остаётся русское `name`: по нему сходятся фильтр города, адрес
 * склада и точка на карте, и от языка страницы этот ключ зависеть не должен.
 */
export interface City {
  /** Ключ города: русское название. По нему фильтруется витрина. */
  name: string;
  /** Как город подписан на странице. */
  title: Copy;
  region: Copy;
  lat: number;
  lng: number;
  weight: number;
}

const MOSCOW_REGION = c("Московская область", "Moscow Region");
const KRASNODAR_KRAI = c("Краснодарский край", "Krasnodar Krai");

export const CITIES: City[] = [
  {
    name: "Москва",
    title: c("Москва", "Moscow"),
    region: c("Москва", "Moscow"),
    lat: 55.7558,
    lng: 37.6173,
    weight: 9,
  },
  {
    name: "Химки",
    title: c("Химки", "Khimki"),
    region: MOSCOW_REGION,
    lat: 55.897,
    lng: 37.4297,
    weight: 3,
  },
  {
    name: "Подольск",
    title: c("Подольск", "Podolsk"),
    region: MOSCOW_REGION,
    lat: 55.4312,
    lng: 37.5453,
    weight: 3,
  },
  {
    name: "Балашиха",
    title: c("Балашиха", "Balashikha"),
    region: MOSCOW_REGION,
    lat: 55.7969,
    lng: 37.9385,
    weight: 3,
  },
  {
    name: "Санкт-Петербург",
    title: c("Санкт-Петербург", "Saint Petersburg"),
    region: c("Санкт-Петербург", "Saint Petersburg"),
    lat: 59.9311,
    lng: 30.3609,
    weight: 6,
  },
  {
    name: "Екатеринбург",
    title: c("Екатеринбург", "Yekaterinburg"),
    region: c("Свердловская область", "Sverdlovsk Region"),
    lat: 56.8389,
    lng: 60.6057,
    weight: 4,
  },
  {
    name: "Казань",
    title: c("Казань", "Kazan"),
    region: c("Татарстан", "Tatarstan"),
    lat: 55.7963,
    lng: 49.1088,
    weight: 3,
  },
  {
    name: "Новосибирск",
    title: c("Новосибирск", "Novosibirsk"),
    region: c("Новосибирская область", "Novosibirsk Region"),
    lat: 55.0084,
    lng: 82.9357,
    weight: 3,
  },
  {
    name: "Краснодар",
    title: c("Краснодар", "Krasnodar"),
    region: KRASNODAR_KRAI,
    lat: 45.0355,
    lng: 38.9753,
    weight: 3,
  },
  {
    name: "Ростов-на-Дону",
    title: c("Ростов-на-Дону", "Rostov-on-Don"),
    region: c("Ростовская область", "Rostov Region"),
    lat: 47.2357,
    lng: 39.7015,
    weight: 2,
  },
  {
    name: "Нижний Новгород",
    title: c("Нижний Новгород", "Nizhny Novgorod"),
    region: c("Нижегородская область", "Nizhny Novgorod Region"),
    lat: 56.2965,
    lng: 43.9361,
    weight: 2,
  },
  {
    name: "Самара",
    title: c("Самара", "Samara"),
    region: c("Самарская область", "Samara Region"),
    lat: 53.1959,
    lng: 50.1002,
    weight: 2,
  },
  {
    name: "Челябинск",
    title: c("Челябинск", "Chelyabinsk"),
    region: c("Челябинская область", "Chelyabinsk Region"),
    lat: 55.1644,
    lng: 61.4368,
    weight: 2,
  },
  {
    name: "Уфа",
    title: c("Уфа", "Ufa"),
    region: c("Башкортостан", "Bashkortostan"),
    lat: 54.7388,
    lng: 55.9721,
    weight: 2,
  },
  {
    name: "Пермь",
    title: c("Пермь", "Perm"),
    region: c("Пермский край", "Perm Krai"),
    lat: 58.0105,
    lng: 56.2502,
    weight: 2,
  },
  {
    name: "Воронеж",
    title: c("Воронеж", "Voronezh"),
    region: c("Воронежская область", "Voronezh Region"),
    lat: 51.672,
    lng: 39.1843,
    weight: 2,
  },
  {
    name: "Тюмень",
    title: c("Тюмень", "Tyumen"),
    region: c("Тюменская область", "Tyumen Region"),
    lat: 57.1522,
    lng: 65.5272,
    weight: 1,
  },
  {
    name: "Красноярск",
    title: c("Красноярск", "Krasnoyarsk"),
    region: c("Красноярский край", "Krasnoyarsk Krai"),
    lat: 56.0153,
    lng: 92.8932,
    weight: 1,
  },
  {
    name: "Волгоград",
    title: c("Волгоград", "Volgograd"),
    region: c("Волгоградская область", "Volgograd Region"),
    lat: 48.708,
    lng: 44.5133,
    weight: 1,
  },
  {
    name: "Саратов",
    title: c("Саратов", "Saratov"),
    region: c("Саратовская область", "Saratov Region"),
    lat: 51.5336,
    lng: 46.0343,
    weight: 1,
  },
  {
    name: "Иркутск",
    title: c("Иркутск", "Irkutsk"),
    region: c("Иркутская область", "Irkutsk Region"),
    lat: 52.2864,
    lng: 104.2807,
    weight: 1,
  },
  {
    name: "Хабаровск",
    title: c("Хабаровск", "Khabarovsk"),
    region: c("Хабаровский край", "Khabarovsk Krai"),
    lat: 48.4802,
    lng: 135.0719,
    weight: 1,
  },
  {
    name: "Владивосток",
    title: c("Владивосток", "Vladivostok"),
    region: c("Приморский край", "Primorsky Krai"),
    lat: 43.1155,
    lng: 131.8855,
    weight: 1,
  },
  {
    name: "Калининград",
    title: c("Калининград", "Kaliningrad"),
    region: c("Калининградская область", "Kaliningrad Region"),
    lat: 54.7104,
    lng: 20.4522,
    weight: 1,
  },
  {
    name: "Сочи",
    title: c("Сочи", "Sochi"),
    region: KRASNODAR_KRAI,
    lat: 43.5855,
    lng: 39.7231,
    weight: 1,
  },
  {
    name: "Ярославль",
    title: c("Ярославль", "Yaroslavl"),
    region: c("Ярославская область", "Yaroslavl Region"),
    lat: 57.6261,
    lng: 39.8845,
    weight: 1,
  },
  {
    name: "Рязань",
    title: c("Рязань", "Ryazan"),
    region: c("Рязанская область", "Ryazan Region"),
    lat: 54.6295,
    lng: 39.7415,
    weight: 1,
  },
  {
    name: "Ижевск",
    title: c("Ижевск", "Izhevsk"),
    region: c("Удмуртия", "Udmurtia"),
    lat: 56.8526,
    lng: 53.2045,
    weight: 1,
  },
];

/** Улицы промзон: адрес склада не бывает «улица Пушкина, 1». */
export const STREETS: Copy[] = [
  c("Промышленная", "Promyshlennaya St"),
  c("Складская", "Skladskaya St"),
  c("Логистическая", "Logisticheskaya St"),
  c("Индустриальная", "Industrialnaya St"),
  c("Транспортная", "Transportnaya St"),
  c("Литейная", "Liteynaya St"),
  c("Комбинатская", "Kombinatskaya St"),
  c("Заводская", "Zavodskaya St"),
  c("Магистральная", "Magistralnaya St"),
  c("Проезд Стройкомбината", "Stroykombinata Dr"),
  c("Тарный проезд", "Tarny Dr"),
  c("Элеваторная", "Elevatornaya St"),
  c("Контейнерная", "Konteynernaya St"),
  c("Автодорожная", "Avtodorozhnaya St"),
];
