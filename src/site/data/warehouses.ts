import { CITIES, STREETS, type City } from "./cities";
import { MARKETPLACES, SERVICES, type SchemeId, type ServiceId } from "./marketplaces";

/**
 * Витрина складов. Данные сгенерированы, а не собраны: это демоверсия, живого
 * реестра фулфилмент-операторов за ней нет.
 *
 * Генератор детерминированный (`mulberry32` от фиксированного зерна). Это не
 * придирка к чистоте: набор, который перетасовывается на каждой перезагрузке,
 * читается как сломанный — селлер возвращается по ссылке и не находит склад,
 * который только что смотрел. Поэтому «случайно» здесь означает «один раз при
 * сборке набора», а не «каждый раз заново».
 */

export interface WarehousePrice {
  /** ₽ за паллето-место в сутки. */
  storage: number;
  /** ₽ за приёмку коробки. */
  receiving: number;
  /** ₽ за собранный заказ. */
  picking: number;
  /** ₽ за единицу маркировки. */
  marking: number;
}

export interface Warehouse {
  id: string;
  name: string;
  legal: string;
  city: string;
  region: string;
  address: string;
  lat: number;
  lng: number;
  /** Год начала работы. */
  since: number;
  areaM2: number;
  cellsTotal: number;
  cellsFree: number;
  schemes: SchemeId[];
  marketplaces: string[];
  services: ServiceId[];
  price: WarehousePrice;
  /** Минимальный объём в местах хранения; 0 — берут любой. */
  minPlaces: number;
  rating: number;
  reviews: number;
  /** Среднее время ответа на заявку, часов. */
  responseHours: number;
  /**
   * Уклад проверил склад сам: госрегистрацию и право пользования помещением
   * (что именно и с какой оговоркой — в `data/legal/requisites.ts`).
   * «Проверенный» на витрине значит ровно это и ничего больше: не отзыв
   * соседа, не самоописание склада и не «оператор прислал скан».
   */
  verified: boolean;
  /** Склад работает на Укладе — значит, план и остатки видно селлеру. */
  uklad: boolean;
  /** Оттенок обложки карточки, град. */
  hue: number;
  /**
   * Файл обложки в `public/photos/warehouses/`. Есть не у всех — у кого нет,
   * карточка рисует плиту в оттенке `hue` (см. `WarehouseCover`).
   */
  photo?: string;
  pitch: string;
}

/** Быстрый детерминированный ГПСЧ (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Доля складов, которые Уклад проверил, но к себе на WMS ещё не подключил. */
const CHECKED_SHARE = 0.34;
/** Доля складов, работающих на Укладе. */
const UKLAD_SHARE = 0.38;

/**
 * Две отметки склада разом — потому что они не независимы.
 *
 * Проверку делает сам Уклад, и склад на нашей WMS её проходит по определению:
 * подключение начинается с тех же документов. Обратное неверно — проверенный
 * склад вполне может работать на чужой системе. Отсюда инвариант
 * `uklad ⇒ verified`, и держать его надо здесь, а не надеяться, что два
 * независимых броска случайно не разойдутся: «работает на Укладе, но Укладом не
 * проверен» — это не редкий случай, это враньё в карточке.
 */
function checks(r: () => number): Pick<Warehouse, "verified" | "uklad"> {
  const checkedOnly = r() < CHECKED_SHARE;
  const uklad = r() < UKLAD_SHARE;
  return { verified: checkedOnly || uklad, uklad };
}

const NAME_HEAD = [
  "Куб",
  "Депо",
  "Пакгауз",
  "Ярус",
  "Паллета",
  "Оборот",
  "Короб",
  "Стеллаж",
  "Меркурий",
  "Полка",
  "Ритм",
  "Точка",
  "Вектор",
  "Кластер",
  "Причал",
  "Ангар",
  "Терминал",
  "Артель",
  "Слобода",
  "Ковчег",
  "Транзит",
  "Опора",
  "Рубеж",
  "Сортер",
  "Габарит",
  "Ладья",
  "Пирс",
  "Верста",
];

const NAME_TAIL = [
  "Логистик",
  "Фулфилмент",
  "Склад",
  "Групп",
  "Сервис",
  "ФФ",
  "Про",
  "24",
  "Юг",
  "Восток",
  "Центр",
  "Плюс",
];

const PITCHES = [
  "Берём мелкую партию и не просим минимальный объём на год вперёд",
  "Приёмка в день привоза, отгрузка на следующий",
  "Свой парк газелей до сортировочных центров",
  "Отдельная зона под одежду: отпаривание, бирки, упаковка",
  "Работаем с хрупким: пузырьковая плёнка и жёсткая обрешётка",
  "Кросс-док прямо с рампы — товар не ложится на полку",
  "Фотостудия на территории: карточки снимаем на месте",
  "Ведём Честный знак и сдаём отчётность за селлера",
  "Принимаем возвраты и разбираем их по годным и браку",
  "Ночная смена: заказы, принятые до 22:00, уезжают утром",
];

/** Разброс складов вокруг центра города: промзона, а не главная площадь. */
function scatter(city: City, r: () => number): { lat: number; lng: number; km: number } {
  const angle = r() * Math.PI * 2;
  // Ближе 4 км к центру склады не стоят, дальше 30 — уже другой город.
  const km = 4 + r() * 26;
  const dLat = (km / 111) * Math.sin(angle);
  const dLng = (km / (111 * Math.cos((city.lat * Math.PI) / 180))) * Math.cos(angle);
  return {
    lat: Math.round((city.lat + dLat) * 1e5) / 1e5,
    lng: Math.round((city.lng + dLng) * 1e5) / 1e5,
    km: Math.round(km),
  };
}

function pick<T>(list: readonly T[], r: () => number): T {
  return list[Math.floor(r() * list.length)];
}

/** Подмножество случайной длины `min…max`, без повторов и без пустоты. */
function subset<T>(list: readonly T[], min: number, max: number, r: () => number): T[] {
  const n = min + Math.floor(r() * (max - min + 1));
  const rest = [...list];
  const out: T[] = [];
  for (let i = 0; i < n && rest.length; i++) {
    out.push(rest.splice(Math.floor(r() * rest.length), 1)[0]);
  }
  return out;
}

const int = (r: () => number, min: number, max: number) =>
  min + Math.floor(r() * (max - min + 1));

function buildWarehouses(): Warehouse[] {
  const r = rng(20260826);
  const out: Warehouse[] = [];
  const used = new Set<string>();

  for (const city of CITIES) {
    for (let i = 0; i < city.weight; i++) {
      // Имя не должно повторяться на всю витрину: два «Куб Логистик» в списке
      // читаются как ошибка загрузки, а не как два разных оператора.
      let name = "";
      for (let tries = 0; tries < 12; tries++) {
        const head = pick(NAME_HEAD, r);
        name = r() < 0.35 ? head : `${head} ${pick(NAME_TAIL, r)}`;
        if (!used.has(name)) break;
      }
      used.add(name);

      const spot = scatter(city, r);
      const areaM2 = int(r, 6, 180) * 100;
      const cellsTotal = int(r, Math.round(areaM2 * 0.08), Math.round(areaM2 * 0.16)) * 10;
      const fillRate = 0.55 + r() * 0.42;
      const cellsFree = Math.max(12, Math.round(cellsTotal * (1 - fillRate)));

      // Схемы: FBO есть почти у всех, DBS — редкость.
      const schemes: SchemeId[] = ["FBO"];
      if (r() < 0.82) schemes.push("FBS");
      if (r() < 0.34) schemes.push("DBS");

      const marketplaces = subset(
        MARKETPLACES.map((m) => m.id),
        2,
        6,
        r,
      );
      // Wildberries и Ozon есть у подавляющего большинства — без них склад
      // просто не работает с маркетплейсами.
      if (r() < 0.9 && !marketplaces.includes("wildberries")) marketplaces.push("wildberries");
      if (r() < 0.85 && !marketplaces.includes("ozon")) marketplaces.push("ozon");

      const services = subset(
        SERVICES.map((s) => s.id),
        4,
        10,
        r,
      ) as ServiceId[];

      const rating = Math.round((3.9 + r() * 1.1) * 10) / 10;

      out.push({
        id: `w-${out.length + 1}`,
        name,
        legal: r() < 0.7 ? `ООО «${name.split(" ")[0]}»` : `ИП ${pick(NAME_HEAD, r)}ов`,
        city: city.name,
        region: city.region,
        address: `${pick(STREETS, r)}, ${int(r, 1, 96)}${r() < 0.4 ? ` стр. ${int(r, 1, 12)}` : ""}`,
        lat: spot.lat,
        lng: spot.lng,
        since: int(r, 2013, 2024),
        areaM2,
        cellsTotal,
        cellsFree,
        schemes,
        marketplaces,
        services,
        price: {
          storage: int(r, 16, 68),
          receiving: int(r, 10, 46),
          picking: int(r, 16, 78),
          marking: int(r, 3, 17),
        },
        // Порог входа: либо склад берёт любого, либо от двадцати до двухсот
        // мест. Раньше здесь стояло «от 1 до 10 мест» — величина, которой в
        // фулфилменте не бывает: такой минимум не отсекает никого и на витрине
        // читается как отписка. Бросок ГПСЧ ровно один, как и был, — иначе
        // сдвинулись бы все склады следом, а ссылки на них уже разосланы.
        minPlaces: r() < 0.45 ? 0 : int(r, 2, 20) * 10,
        rating,
        // У молодых складов отзывов физически меньше — иначе рейтинг выглядит
        // одинаково «нагулянным» и у ветерана, и у прошлогоднего новичка.
        reviews: int(r, 6, 60) + Math.round((2025 - int(r, 2013, 2024)) * int(r, 4, 34)),
        responseHours: int(r, 1, 20),
        ...checks(r),
        hue: int(r, 0, 359),
        pitch: pick(PITCHES, r),
      });
    }
  }

  return out;
}

/**
 * Обложки складов — общедоступные снимки под свободными лицензиями; авторы и
 * условия перечислены в `public/photos/warehouses/CREDITS.md`.
 *
 * Кадры выбраны намеренно безымянные: ни вывесок, ни логотипов. Компаний с
 * витрины не существует, и подставлять им чужие настоящие помещения с
 * читаемым названием на стене — значит выдавать один склад за другой.
 */
const PHOTOS = [
  "pallet-hall.webp",
  "distribution-centre.webp",
  "high-rack-aisle.webp",
  "mezzanine-floor.webp",
  "rack-corridor.webp",
  "automated-high-bay.webp",
];

/**
 * Фотография достаётся складам, работающим на Укладе: их мы подключали и
 * видели, у остальных на витрине только присланные документы. Правило заодно
 * держит снимки редкими — шесть кадров на сотню карточек, розданные всем
 * подряд, повторялись бы на одном экране по три раза.
 *
 * Раздача идёт после сборки набора, а не внутри неё: лишний бросок ГПСЧ в
 * цикле сдвинул бы всю последовательность, и витрина пересобралась бы с
 * другими именами, адресами и ценами — а ссылки на склады уже разосланы.
 */
function assignPhotos(list: Warehouse[]): Warehouse[] {
  let taken = 0;
  return list.map((w) =>
    w.uklad ? { ...w, photo: PHOTOS[taken++ % PHOTOS.length] } : w,
  );
}

export const WAREHOUSES: Warehouse[] = assignPhotos(buildWarehouses());

/** Занятость склада в долях единицы — для полосы в карточке. */
export const occupancy = (w: Warehouse): number =>
  1 - w.cellsFree / Math.max(1, w.cellsTotal);

/** «12 500» — цифры в цене должны читаться без счёта разрядов глазами. */
export const money = (n: number): string => n.toLocaleString("ru-RU");

/**
 * Ориентировочный месяц хранения одного места.
 *
 * «Место», а не «паллета»: товар приезжает по-разному — паллетой, коробами,
 * россыпью в короб под комплектацию, — и склад считает то, что реально занял
 * груз. Прайс за паллету в тексте витрины обещал бы единицу измерения,
 * которой у половины поставок нет.
 */
export const monthlyPerPlace = (w: Warehouse): number => w.price.storage * 30;
