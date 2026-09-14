import { CITIES, STREETS, type City } from "./cities";
import { buildLedger, groupByWarehouse, type Ledger } from "./deals";
import { MARKETPLACES, SERVICES, type SchemeId, type ServiceId } from "./marketplaces";
import { c, type Copy } from "../lib/copy";
import { DAY_MS } from "../lib/date";
import { buildReputation, NO_REPUTATION, type Reputation } from "../lib/reputation";
import { int, pick, rng } from "../lib/rng";

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
  name: Copy;
  legal: Copy;
  /** Ключ города — русское название из `cities.ts`. По нему идёт фильтр. */
  city: string;
  /** Как город подписан на странице. */
  cityTitle: Copy;
  region: Copy;
  address: Copy;
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
  /**
   * Когда склад в последний раз подтверждал тарифы и свободные места.
   *
   * У складов на Укладе это делает сама система (`uklad`), у остальных —
   * человек со стороны склада. Поле обязательное: профиль без даты
   * подтверждения ничем не отличается от брошенного, а брошенный профиль
   * подрывает доверие быстрее, чем его отсутствие (см. `lib/freshness`).
   */
  confirmedAt: number;
  /** Минимальный объём в местах хранения; 0 — берут любой. */
  minPlaces: number;
  /**
   * Оценка, отзывы и жалобы — сведённые, а не сгенерированные: считаются из
   * сделок (`data/deals.ts`, `lib/reputation.ts`). В самой записи склада их
   * нет и в базе не будет: там это представление поверх таблицы отзывов.
   * Здесь оно приклеивается один раз при сборке набора — чтобы карточке,
   * фильтру и сравнению не приходилось ходить за ним по отдельности.
   */
  reputation: Reputation;
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
  pitch: Copy;
}

/**
 * Запись склада до того, как к ней приклеили репутацию.
 *
 * Ровно то, чем склад будет в базе: строка со своими полями и без сведённых
 * чисел по чужим таблицам. Генератору здесь больше и не нужно — отзывы про
 * склад пишут после того, как склад появился.
 */
export type WarehouseRecord = Omit<Warehouse, "reputation">;

/**
 * Склад, каким его выдаёт генератор: без фотографии и без даты подтверждения
 * данных. И то и другое раздаётся отдельными проходами по готовому набору —
 * см. `assignPhotos` и `assignConfirmed`.
 */
type RawRecord = Omit<WarehouseRecord, "confirmedAt">;

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

/**
 * Названия складов на английской витрине транслитерируются: «Ярус Логистик»
 * остаётся «Yarus Logistics», а не превращается в «Tier Logistics». Компания
 * называется так, как называется, — переведённое название невозможно найти ни
 * в реестре, ни в переписке с самим складом.
 */
const NAME_HEAD: Copy[] = [
  c("Куб", "Kub"),
  c("Депо", "Depo"),
  c("Пакгауз", "Pakgauz"),
  c("Ярус", "Yarus"),
  c("Паллета", "Palleta"),
  c("Оборот", "Oborot"),
  c("Короб", "Korob"),
  c("Стеллаж", "Stellazh"),
  c("Меркурий", "Merkury"),
  c("Полка", "Polka"),
  c("Ритм", "Ritm"),
  c("Точка", "Tochka"),
  c("Вектор", "Vektor"),
  c("Кластер", "Klaster"),
  c("Причал", "Prichal"),
  c("Ангар", "Angar"),
  c("Терминал", "Terminal"),
  c("Артель", "Artel"),
  c("Слобода", "Sloboda"),
  c("Ковчег", "Kovcheg"),
  c("Транзит", "Tranzit"),
  c("Опора", "Opora"),
  c("Рубеж", "Rubezh"),
  c("Сортер", "Sorter"),
  c("Габарит", "Gabarit"),
  c("Ладья", "Ladya"),
  c("Пирс", "Pirs"),
  c("Верста", "Versta"),
];

const NAME_TAIL: Copy[] = [
  c("Логистик", "Logistics"),
  c("Фулфилмент", "Fulfilment"),
  c("Склад", "Sklad"),
  c("Групп", "Group"),
  c("Сервис", "Service"),
  c("ФФ", "FF"),
  c("Про", "Pro"),
  c("24", "24"),
  c("Юг", "South"),
  c("Восток", "East"),
  c("Центр", "Centre"),
  c("Плюс", "Plus"),
];

const PITCHES: Copy[] = [
  c(
    "Берём мелкую партию и не просим минимальный объём на год вперёд",
    "We take small batches and ask for no year-long minimum",
  ),
  c(
    "Приёмка в день привоза, отгрузка на следующий",
    "Intake the day goods arrive, shipping the next",
  ),
  c("Свой парк газелей до сортировочных центров", "Our own vans running to the sorting centres"),
  c(
    "Отдельная зона под одежду: отпаривание, бирки, упаковка",
    "A separate zone for clothing: steaming, tags, packing",
  ),
  c(
    "Работаем с хрупким: пузырьковая плёнка и жёсткая обрешётка",
    "We handle fragile goods: bubble wrap and rigid crating",
  ),
  c(
    "Кросс-док прямо с рампы — товар не ложится на полку",
    "Cross-docking straight off the ramp — goods never reach a shelf",
  ),
  c(
    "Фотостудия на территории: карточки снимаем на месте",
    "A photo studio on site: listing shots are taken here",
  ),
  c(
    "Ведём Честный знак и сдаём отчётность за селлера",
    "We run Chestny Znak and file the reports for the seller",
  ),
  c(
    "Принимаем возвраты и разбираем их по годным и браку",
    "We take returns and sort them into resalable and defective",
  ),
  c(
    "Ночная смена: заказы, принятые до 22:00, уезжают утром",
    "Night shift: orders placed before 22:00 leave in the morning",
  ),
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

/**
 * Склейка двух двуязычных кусков. Важно, что бросок ГПСЧ на выбор куска
 * по-прежнему ровно один: русская и английская строки лежат в одной записи
 * таблицы, а не выбираются по отдельности. Иначе набор пересобрался бы
 * с другими именами и ценами — а ссылки на склады уже разосланы.
 */
function join(a: Copy, b: Copy, sep = " "): Copy {
  return c(`${a.ru}${sep}${b.ru}`, `${a.en}${sep}${b.en}`);
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

function buildWarehouses(): RawRecord[] {
  const r = rng(20260826);
  const out: RawRecord[] = [];
  const used = new Set<string>();

  for (const city of CITIES) {
    for (let i = 0; i < city.weight; i++) {
      // Имя не должно повторяться на всю витрину: два «Куб Логистик» в списке
      // читаются как ошибка загрузки, а не как два разных оператора.
      // Ключ уникальности — русское имя: пары «русское-английское» жёстко
      // связаны, и если не совпали русские, не совпадут и английские.
      let name: Copy = c("", "");
      for (let tries = 0; tries < 12; tries++) {
        const head = pick(NAME_HEAD, r);
        name = r() < 0.35 ? head : join(head, pick(NAME_TAIL, r));
        if (!used.has(name.ru)) break;
      }
      used.add(name.ru);

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

      // Юрлицо: чаще ООО от первого слова названия, иначе ИП с фамилией от
      // того же корня. Бросков ГПСЧ столько же, сколько было в тернарнике.
      const founder = r() < 0.7 ? null : pick(NAME_HEAD, r);
      const legal = founder
        ? c(`ИП ${founder.ru}ов`, `${founder.en}ov, sole trader`)
        : c(`ООО «${name.ru.split(" ")[0]}»`, `${name.en.split(" ")[0]} LLC`);

      const street = pick(STREETS, r);
      const house = int(r, 1, 96);
      // Строение есть не у каждого адреса — на промзоне это обычное дело.
      const building = r() < 0.4 ? int(r, 1, 12) : 0;

      out.push({
        id: `w-${out.length + 1}`,
        name,
        legal,
        city: city.name,
        cityTitle: city.title,
        region: city.region,
        address: c(
          `${street.ru}, ${house}${building ? ` стр. ${building}` : ""}`,
          `${street.en}, ${house}${building ? `, bld. ${building}` : ""}`,
        ),
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
function assignPhotos(list: RawRecord[]): RawRecord[] {
  let taken = 0;
  return list.map((w) => (w.uklad ? { ...w, photo: PHOTOS[taken++ % PHOTOS.length] } : w));
}

/** Сколько дней назад подтверждал данные склад на Укладе: цифры живые. */
const LIVE_DAYS = 1;
/** Разброс дней для остальных: от вчера до примерно восьми месяцев. */
const CONFIRMED_DAYS_MAX = 240;

/**
 * Дата последнего подтверждения тарифов и свободных мест.
 *
 * Отдельным проходом и со своим зерном — по той же причине, что и фотографии:
 * бросок внутри цикла сборки сдвинул бы всю последовательность и пересобрал бы
 * витрину с другими именами и ценами.
 *
 * Складам на Укладе ставится вчерашний день, и это не поблажка своим: их
 * остатки витрина берёт из той же системы, где они меняются каждой приёмкой.
 * Остальные подтверждают руками, и часть из них — давно; такие склады витрина
 * и должна показывать как есть, а не подмешивать им свежую дату (см.
 * `lib/freshness`).
 */
function assignConfirmed(list: RawRecord[], now: number): WarehouseRecord[] {
  const r = rng(20260912);
  return list.map((w) => ({
    ...w,
    confirmedAt: now - int(r, w.uklad ? 0 : 1, w.uklad ? LIVE_DAYS : CONFIRMED_DAYS_MAX) * DAY_MS,
  }));
}

/**
 * Момент сборки набора.
 *
 * От него зависит возраст отзывов и срок, в который склад должен был ответить
 * на жалобу. Берётся один раз: сравнивать записи, посчитанные по разным
 * «сейчас», значит получать набор, который меняется сам по себе посреди
 * страницы. При сборке это время сборки, в браузере — время загрузки; и там,
 * и там — одно на всю витрину.
 */
const NOW = Date.now();

/** Набор складов до репутации — собирается ровно один раз. */
const RECORDS: WarehouseRecord[] = assignConfirmed(assignPhotos(buildWarehouses()), NOW);

/** Сделки, отзывы и жалобы всей витрины. Собираются по готовому набору складов. */
const LEDGER: Ledger = buildLedger(
  RECORDS.map((w) => w.id),
  NOW,
);

export const REVIEWS = LEDGER.reviews;
export const COMPLAINTS = LEDGER.complaints;
export const DEALS = LEDGER.deals;

/**
 * Приклеить к складам их репутацию.
 *
 * Тем же пост-проходом, что и фотографии, и по той же причине: внутри цикла
 * сборки этого сделать нельзя — отзывы пишут про уже существующий склад, и
 * генератору сделок нужны его идентификаторы. Склад, с которым через Уклад
 * никто ещё не работал, получает пустую репутацию, а не ноль отзывов и
 * рейтинг «0»: это разные утверждения.
 */
function withReputation(list: WarehouseRecord[]): Warehouse[] {
  const reviews = groupByWarehouse(LEDGER.reviews);
  const complaints = groupByWarehouse(LEDGER.complaints);
  return list.map((w) => {
    const own = reviews.get(w.id);
    const claims = complaints.get(w.id);
    return {
      ...w,
      reputation: own || claims ? buildReputation(own ?? [], claims ?? [], NOW) : NO_REPUTATION,
    };
  });
}

export const WAREHOUSES: Warehouse[] = withReputation(RECORDS);

/** Занятость склада в долях единицы — для полосы в карточке. */
export const occupancy = (w: Warehouse): number => 1 - w.cellsFree / Math.max(1, w.cellsTotal);

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
