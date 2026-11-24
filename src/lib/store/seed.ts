import { nowMs, uid } from "../utils";
import { buildCatalog } from "../catalog";
import { generateEan13 } from "../barcode";
import type {
  Account,
  CategoryField,
  Partner,
  PlacedModule,
  Product,
  ShelfTemplate,
  StaffMember,
  Warehouse,
  WarehouseKind,
  WarehouseSpec,
} from "../types";
import { makeModule, withShelves } from "./helpers";

/**
 * Стартовое демо-состояние: склады, номенклатура, доп.поля, шаблоны.
 * Отделено от слайсов — это данные посева, а не логика редактирования.
 */

/**
 * Демо-номенклатура (ТЗ, разд. 2.5): артикул, штрихкод, категория, габариты
 * Ш×В×Г в см с десятыми, вес — опционально. Фото генерируется в UI из артикула.
 */
export function seedProducts(): Product[] {
  return buildCatalog(() => uid("prod"));
}

/**
 * Стартовые доп.поля категорий (ТЗ, разд. 3.8) — «заданы админом заранее».
 * Часть из них сразу со значениями (см. init), чтобы удаление использованного
 * поля показывало предупреждение о потере данных без ручной подготовки.
 */
export function seedCategoryFields(): CategoryField[] {
  return [
    {
      id: uid("fld"),
      category: "Одежда",
      name: "Размер",
      type: "select",
      options: ["XS", "S", "M", "L", "XL"],
    },
    { id: uid("fld"), category: "Одежда", name: "Цвет", type: "text" },
    {
      id: uid("fld"),
      category: "Электроника",
      name: "Гарантия, мес",
      type: "number",
    },
  ];
}

/**
 * Демо-персонал склада (п.6): список не должен быть пустым, иначе поле
 * «кто принял» на приёмке выглядит как недоделанная заглушка.
 */
export function seedStaff(): StaffMember[] {
  // Двадцать человек на все участки: приёмка, хранение, сборка, упаковка,
  // отгрузка и техника. У всех есть телефон и почта, у работающих по часам —
  // ставка: без них расчёт оплаты и журнал смены в демо пустые.
  return [
    {
      id: uid("staff"),
      name: "Игорь Панов",
      role: "Управляющий склада",
      phone: "+7 916 200-11-04",
      email: "panov@uklad.ru",
    },
    {
      id: uid("staff"),
      name: "Наталья Верещагина",
      role: "Заместитель управляющего",
      phone: "+7 916 200-11-05",
      email: "vereshchagina@uklad.ru",
    },
    {
      id: uid("staff"),
      name: "Марина Соловьёва",
      role: "Старший кладовщик",
      phone: "+7 916 200-11-08",
      email: "soloveva@uklad.ru",
      hourlyRate: 420,
    },
    {
      id: uid("staff"),
      name: "Константин Рябов",
      role: "Старший смены",
      phone: "+7 916 200-11-09",
      email: "ryabov@uklad.ru",
      hourlyRate: 420,
    },
    {
      id: uid("staff"),
      name: "Тимур Ахметов",
      role: "Кладовщик",
      phone: "+7 916 200-11-12",
      email: "akhmetov@uklad.ru",
      hourlyRate: 380,
    },
    {
      id: uid("staff"),
      name: "Сергей Гаврилов",
      role: "Кладовщик",
      phone: "+7 916 200-11-14",
      email: "gavrilov@uklad.ru",
      hourlyRate: 380,
    },
    {
      id: uid("staff"),
      name: "Анна Фролова",
      role: "Кладовщик",
      phone: "+7 916 200-11-15",
      email: "frolova@uklad.ru",
      hourlyRate: 380,
    },
    {
      id: uid("staff"),
      name: "Дарья Кузьмина",
      role: "Оператор приёмки",
      phone: "+7 916 200-11-17",
      email: "kuzmina@uklad.ru",
      hourlyRate: 360,
    },
    {
      id: uid("staff"),
      name: "Алексей Ким",
      role: "Оператор приёмки",
      phone: "+7 916 200-11-19",
      email: "kim@uklad.ru",
      hourlyRate: 360,
    },
    {
      id: uid("staff"),
      name: "Рустам Юсупов",
      role: "Комплектовщик",
      phone: "+7 916 200-11-23",
      email: "yusupov@uklad.ru",
      hourlyRate: 350,
    },
    {
      id: uid("staff"),
      name: "Ольга Демидова",
      role: "Комплектовщик",
      phone: "+7 916 200-11-25",
      email: "demidova@uklad.ru",
      hourlyRate: 350,
    },
    {
      id: uid("staff"),
      name: "Илья Сорокин",
      role: "Комплектовщик",
      phone: "+7 916 200-11-26",
      email: "sorokin@uklad.ru",
      hourlyRate: 350,
    },
    {
      id: uid("staff"),
      name: "Екатерина Новикова",
      role: "Упаковщик",
      phone: "+7 916 200-11-27",
      email: "novikova@uklad.ru",
      hourlyRate: 340,
    },
    {
      id: uid("staff"),
      name: "Максим Зайцев",
      role: "Упаковщик",
      phone: "+7 916 200-11-28",
      email: "zaytsev@uklad.ru",
      hourlyRate: 340,
    },
    {
      id: uid("staff"),
      name: "Светлана Попова",
      role: "Упаковщик",
      phone: "+7 916 200-11-29",
      email: "popova@uklad.ru",
      hourlyRate: 340,
    },
    {
      id: uid("staff"),
      name: "Виктор Лапин",
      role: "Водитель погрузчика",
      phone: "+7 916 200-11-31",
      email: "lapin@uklad.ru",
      hourlyRate: 450,
    },
    {
      id: uid("staff"),
      name: "Андрей Мешков",
      role: "Водитель погрузчика",
      phone: "+7 916 200-11-33",
      email: "meshkov@uklad.ru",
      hourlyRate: 450,
    },
    {
      id: uid("staff"),
      name: "Денис Орехов",
      role: "Грузчик",
      phone: "+7 916 200-11-35",
      email: "orekhov@uklad.ru",
      hourlyRate: 320,
    },
    {
      id: uid("staff"),
      name: "Галина Петрова",
      role: "Оператор отгрузки",
      phone: "+7 916 200-11-37",
      email: "petrova@uklad.ru",
      hourlyRate: 360,
    },
    {
      id: uid("staff"),
      name: "Пётр Савельев",
      role: "Охрана, пост на въезде",
      phone: "+7 916 200-11-40",
      email: "savelev@uklad.ru",
      hourlyRate: 300,
    },
  ];
}

/** Партнёры-продавцы: чьи товары лежат на складе (п.15). */
function seedPartners(): Partner[] {
  // Контакт — почта продавца (на неё уходит приглашение в кабинет), а
  // контактное лицо и телефон — заполнены у всех: пустые поля в демо
  // выглядят как недоделка (Кирилл 12 ноя). Реквизиты — у первых трёх:
  // остальные показывают, что партнёра заводят и без ИНН.
  return [
    {
      id: uid("ptn"),
      name: "ООО «Ромашка Трейд»",
      contact: "orders@romashka-trade.ru",
      person: "Елена Жукова",
      phone: "+7 495 780-12-40",
      inn: "7728451361",
      legalName: "ООО «РОМАШКА ТРЕЙД»",
      kpp: "772801001",
      ogrn: "1177746183922",
      legalAddress: "г. Москва, ул. Профсоюзная, д. 56, помещ. 12",
    },
    {
      id: uid("ptn"),
      name: "ИП Ковалёв А. С.",
      contact: "kovalev.shop@mail.ru",
      person: "Андрей Ковалёв",
      phone: "+7 903 512-44-19",
      inn: "502917483684",
      legalName: "ИП Ковалёв Андрей Сергеевич",
      ogrn: "319502900018424",
    },
    {
      id: uid("ptn"),
      name: "ООО «Северный склад»",
      contact: "info@sever-sklad.ru",
      person: "Павел Ершов",
      phone: "+7 812 640-33-11",
      inn: "7814629030",
      legalName: "ООО «СЕВЕРНЫЙ СКЛАД»",
      kpp: "781401001",
      ogrn: "1157847012740",
      legalAddress: "г. Санкт-Петербург, Выборгское ш., д. 212, лит. А",
    },
    {
      id: uid("ptn"),
      name: "ООО «ТехноЛайн»",
      contact: "sales@technoline.ru",
      person: "Ирина Белова",
      phone: "+7 495 118-90-27",
    },
    {
      id: uid("ptn"),
      name: "ИП Мамедова Л. Р.",
      contact: "mamedova.lr@yandex.ru",
      person: "Лейла Мамедова",
      phone: "+7 926 445-70-02",
    },
    {
      id: uid("ptn"),
      name: "ООО «Дом и Сад»",
      contact: "opt@domisad.ru",
      person: "Григорий Орлов",
      phone: "+7 499 230-61-58",
    },
  ];
}

/**
 * Паспорт демо-склада (п.1, п.8). Заполнен целиком: пустой паспорт выглядит
 * как незаконченная форма, а не как склад, который работает шестой год.
 */
function seedSpec(): WarehouseSpec {
  return {
    warehouseClass: "B+",
    builtYear: 2011,
    totalAreaM2: 4200,
    storageAreaM2: 3150,
    ceilingHeightM: 9.6,
    floorLoadKgM2: 6000,
    floorType: "Бетонный, наливное антипылевое покрытие, разметка проходов 2023",
    rackType: "Мезонин 2 яруса (Dexion), фронтальные стеллажи 4 уровня",
    palletCapacity: 2860,

    hours: "Пн–Пт 8:00–20:00, Сб 9:00–16:00, Вс — только отгрузка по записи",
    round0Clock: false,
    docks: 5,
    dockType: "4 дока с доклевеллерами, 1 ворота с уровня земли для «Газелей»",
    rampHeightCm: 120,
    parkingSpots: 8,
    railSpur: false,
    accessNote:
      "Въезд по пропуску, заявка за сутки на охрану. Ограничение по длине — 16,5 м, разворот на площадке есть",

    tempMinC: 5,
    tempMaxC: 24,
    humidityMin: 35,
    humidityMax: 65,
    climateNote:
      "Отопление воздушное, приточно-вытяжная вентиляция, холодильная камера 18 м² (+2…+6 °C)",

    equipment:
      "2 ричтрака Jungheinrich (до 8,5 м), 3 самоходных штабелёра, 8 гидравлических тележек, 2 стола упаковки",
    wmsName: "Уклад (этот сервис) + выгрузка в 1С:УТ раз в час",
    networkNote: "Wi-Fi по всей площади, 12 ТСД Zebra TC21, резервный канал LTE",

    fireCategory: "V2",
    fireNote:
      "Спринклерная система, АПС с выводом на пульт, 2 эвакуационных выхода, огнетушители ОП-5 по 1 на 200 м²",
    securityNote: "Охрана ЧОП «Гарант», обход каждые 2 часа, тревожная кнопка",
    guarded: true,
    cctvCount: 34,
    accessControl: "СКУД по картам, журнал пропусков на въезде, отдельная зона для водителей",

    restrictions:
      "ЛВЖ, пиротехника, аккумуляторы свыше 100 Вт·ч; пищевые группы — только в отдельной зоне мезонина",
    maxShelfKg: 320,
    features:
      "Пандус для «Газелей», грузовой лифт 1,5 т на мезонин, узкие проходы 1,8 м на втором ярусе",
    condition:
      "Кровля перекрыта в 2022, стеллажи проходят ежегодную экспертизу, полы шлифованы весной 2025",

    insuranceNote: "Ответственность хранителя, «Ингосстрах», лимит 15 млн ₽ на страховой случай",
    licenses: "Декларация пожарной безопасности от 03.2024, СЭЗ на непродовольственную группу",
    services:
      "Фасовка и переупаковка, маркировка «Честным знаком», фотосъёмка для карточек, обработка возвратов",
    contractNote:
      "Договор ответственного хранения, тариф за паллетоместо в сутки, счёт помесячно до 5-го числа",

    // Паспорт живой: последняя правка — пару недель назад, а не «никогда».
    updatedAt: nowMs() - 17 * 86_400_000,
  };
}

/** Стартовая библиотека шаблонов раскладок. */
export function seedTemplates(): ShelfTemplate[] {
  return [
    { id: uid("tpl"), name: "Стандарт 4×4", cells: [4, 4, 4, 4] },
    { id: uid("tpl"), name: "Мелкие ячейки", cells: [6, 6, 6, 6, 6] },
    { id: uid("tpl"), name: "Крупные ячейки", cells: [2, 2] },
    { id: uid("tpl"), name: "Смешанная", cells: [2, 5, 3] },
  ];
}

// Раскладка демо-склада №1 — реальный план пользователя: 108 секций-стеллажей в
// 8 линиях (x = 2,4,5,7,8,10,11,13) вдоль вертикальных проходов (зазоры x = 3,6,
// 9,12 — это «пол-проход») и 2 лестницы в линии x=7. Компактная кодировка одной
// строкой на модуль: секция — { x,y,w,h, c:[ячейки полок], r?:ряд }, лестница —
// { t:"stairs", ... }. Габариты в см достраиваются как w*100 / h*100 (для
// лестниц — явные rw/rd, если отличаются). JSON-объекты — валидные TS-литералы.
type PlanEntry = {
  t?: "stairs";
  x: number;
  y: number;
  w: number;
  h: number;
  c?: number[];
  r?: number;
  rw?: number;
  rd?: number;
};

const WAREHOUSE_1_PLAN: PlanEntry[] = [
  { x: 2, y: 3, w: 1, h: 3, c: [2, 5, 3], r: 18 },
  { x: 2, y: 6, w: 1, h: 3, c: [2, 5, 3], r: 18 },
  { x: 2, y: 10, w: 1, h: 3, c: [4, 4, 4, 4, 4], r: 18 },
  { x: 2, y: 13, w: 1, h: 3, c: [2, 5, 3], r: 18 },
  { x: 2, y: 16, w: 1, h: 3, c: [2, 5, 3], r: 18 },
  { x: 2, y: 19, w: 1, h: 3, c: [2, 5, 3], r: 18 },
  { x: 2, y: 22, w: 1, h: 3, c: [2, 5, 3], r: 18 },
  { x: 2, y: 25, w: 1, h: 3, c: [2, 5, 3], r: 18 },
  { x: 2, y: 30, w: 1, h: 3, c: [2, 5, 3], r: 18 },
  { x: 2, y: 33, w: 1, h: 3, c: [2, 5, 3], r: 18 },
  { x: 2, y: 36, w: 1, h: 3, c: [2, 5, 3], r: 18 },
  { x: 2, y: 39, w: 1, h: 3, c: [2, 5, 3], r: 18 },
  { x: 2, y: 42, w: 1, h: 3, c: [2, 5, 3], r: 18 },
  { x: 2, y: 45, w: 1, h: 3, c: [2, 5, 3], r: 18 },
  { x: 4, y: 3, w: 1, h: 3, c: [4, 4, 4, 3], r: 18 },
  { x: 4, y: 6, w: 1, h: 3, c: [4, 4, 4, 3], r: 18 },
  { x: 4, y: 10, w: 1, h: 3, c: [4, 4, 4, 3], r: 18 },
  { x: 4, y: 13, w: 1, h: 3, c: [4, 4, 4, 3], r: 18 },
  { x: 4, y: 16, w: 1, h: 3, c: [4, 4, 4, 3], r: 18 },
  { x: 4, y: 19, w: 1, h: 3, c: [4, 4, 4, 3], r: 18 },
  { x: 4, y: 22, w: 1, h: 3, c: [4, 4, 4, 3], r: 18 },
  { x: 4, y: 25, w: 1, h: 3, c: [4, 4, 4, 3], r: 18 },
  { x: 4, y: 30, w: 1, h: 3, c: [4, 4, 4, 3], r: 18 },
  { x: 4, y: 33, w: 1, h: 3, c: [4, 4, 4, 3], r: 18 },
  { x: 4, y: 36, w: 1, h: 3, c: [4, 4, 4, 3], r: 18 },
  { x: 4, y: 39, w: 1, h: 3, c: [4, 4, 4, 3], r: 18 },
  { x: 4, y: 42, w: 1, h: 3, c: [4, 4, 4, 3], r: 18 },
  { x: 4, y: 45, w: 1, h: 3, c: [4, 4, 4, 3], r: 18 },
  { x: 5, y: 3, w: 1, h: 3, c: [4, 4, 4, 3], r: 19 },
  { x: 5, y: 6, w: 1, h: 3, c: [4, 4, 4, 3], r: 19 },
  { x: 5, y: 10, w: 1, h: 3, c: [4, 4, 4, 3], r: 19 },
  { x: 5, y: 13, w: 1, h: 3, c: [4, 4, 4, 3], r: 19 },
  { x: 5, y: 16, w: 1, h: 3, c: [4, 4, 4, 3], r: 19 },
  { x: 5, y: 19, w: 1, h: 3, c: [4, 4, 4, 3], r: 19 },
  { x: 5, y: 22, w: 1, h: 3, c: [4, 4, 4, 3], r: 19 },
  { x: 5, y: 25, w: 1, h: 3, c: [4, 4, 4, 3], r: 19 },
  { x: 5, y: 30, w: 1, h: 3, c: [4, 4, 4, 3], r: 19 },
  { x: 5, y: 33, w: 1, h: 3, c: [4, 4, 4, 3], r: 19 },
  { x: 5, y: 36, w: 1, h: 3, c: [4, 4, 4, 3], r: 19 },
  { x: 5, y: 39, w: 1, h: 3, c: [4, 4, 4, 3], r: 19 },
  { x: 5, y: 42, w: 1, h: 3, c: [4, 4, 4, 3], r: 19 },
  { x: 5, y: 45, w: 1, h: 3, c: [4, 4, 4, 3], r: 19 },
  { x: 7, y: 3, w: 1, h: 3, c: [2, 5, 3], r: 19 },
  { x: 7, y: 6, w: 1, h: 3, c: [2, 5, 3], r: 19 },
  { t: "stairs", x: 7, y: 10, w: 1, h: 6, rw: 200, rd: 200 },
  { x: 7, y: 16, w: 1, h: 3, c: [2, 5, 3], r: 19 },
  { x: 7, y: 19, w: 1, h: 3, c: [2, 5, 3], r: 19 },
  { x: 7, y: 22, w: 1, h: 3, c: [2, 5, 3], r: 19 },
  { x: 7, y: 25, w: 1, h: 3, c: [2, 5, 3], r: 19 },
  { x: 7, y: 30, w: 1, h: 3, c: [2, 5, 3], r: 19 },
  { x: 7, y: 33, w: 1, h: 3, c: [2, 5, 3], r: 19 },
  { x: 7, y: 36, w: 1, h: 3, c: [2, 5, 3], r: 19 },
  { t: "stairs", x: 7, y: 39, w: 1, h: 6, rw: 200, rd: 200 },
  { x: 7, y: 45, w: 1, h: 3, c: [2, 5, 3], r: 19 },
  { x: 8, y: 3, w: 1, h: 3, c: [4, 4, 4, 4, 4], r: 20 },
  { x: 8, y: 6, w: 1, h: 3, c: [2, 5, 3], r: 20 },
  { x: 8, y: 10, w: 1, h: 3, c: [4, 4, 4, 4, 4], r: 20 },
  { x: 8, y: 13, w: 1, h: 3, c: [2, 5, 3], r: 20 },
  { x: 8, y: 16, w: 1, h: 3, c: [4, 4, 4, 4, 4], r: 20 },
  { x: 8, y: 19, w: 1, h: 3, c: [2, 5, 3], r: 20 },
  { x: 8, y: 22, w: 1, h: 3, c: [4, 4, 4, 4, 4], r: 20 },
  { x: 8, y: 25, w: 1, h: 3, c: [2, 5, 3], r: 20 },
  { x: 8, y: 30, w: 1, h: 3, c: [4, 4, 4, 4, 4], r: 20 },
  { x: 8, y: 33, w: 1, h: 3, c: [2, 5, 3], r: 20 },
  { x: 8, y: 36, w: 1, h: 3, c: [4, 4, 4, 4, 4], r: 20 },
  { x: 8, y: 39, w: 1, h: 3, c: [2, 5, 3], r: 20 },
  { x: 8, y: 42, w: 1, h: 3, c: [4, 4, 4, 4, 4], r: 20 },
  { x: 8, y: 45, w: 1, h: 3, c: [2, 5, 3], r: 20 },
  { x: 10, y: 3, w: 1, h: 3, c: [4, 4, 4, 3], r: 20 },
  { x: 10, y: 6, w: 1, h: 3, c: [4, 4, 4, 3], r: 20 },
  { x: 10, y: 10, w: 1, h: 3, c: [4, 4, 4, 3], r: 20 },
  { x: 10, y: 13, w: 1, h: 3, c: [4, 4, 4, 3], r: 20 },
  { x: 10, y: 16, w: 1, h: 3, c: [4, 4, 4, 3], r: 20 },
  { x: 10, y: 19, w: 1, h: 3, c: [4, 4, 4, 3], r: 20 },
  { x: 10, y: 22, w: 1, h: 3, c: [4, 4, 4, 3], r: 20 },
  { x: 10, y: 25, w: 1, h: 3, c: [4, 4, 4, 3], r: 20 },
  { x: 10, y: 30, w: 1, h: 3, c: [4, 4, 4, 3], r: 20 },
  { x: 10, y: 33, w: 1, h: 3, c: [4, 4, 4, 3], r: 20 },
  { x: 10, y: 36, w: 1, h: 3, c: [4, 4, 4, 3], r: 20 },
  { x: 10, y: 39, w: 1, h: 3, c: [4, 4, 4, 3], r: 20 },
  { x: 10, y: 42, w: 1, h: 3, c: [4, 4, 4, 3], r: 20 },
  { x: 10, y: 45, w: 1, h: 3, c: [4, 4, 4, 3], r: 20 },
  { x: 11, y: 3, w: 1, h: 3, c: [4, 4, 4, 3], r: 21 },
  { x: 11, y: 6, w: 1, h: 3, c: [4, 4, 4, 3], r: 21 },
  { x: 11, y: 10, w: 1, h: 3, c: [4, 4, 4, 3], r: 21 },
  { x: 11, y: 13, w: 1, h: 3, c: [4, 4, 4, 3], r: 21 },
  { x: 11, y: 16, w: 1, h: 3, c: [4, 4, 4, 3], r: 21 },
  { x: 11, y: 19, w: 1, h: 3, c: [4, 4, 4, 3], r: 21 },
  { x: 11, y: 22, w: 1, h: 3, c: [4, 4, 4, 3], r: 21 },
  { x: 11, y: 25, w: 1, h: 3, c: [4, 4, 4, 3], r: 21 },
  { x: 11, y: 30, w: 1, h: 3, c: [4, 4, 4, 3], r: 21 },
  { x: 11, y: 33, w: 1, h: 3, c: [4, 4, 4, 3], r: 21 },
  { x: 11, y: 36, w: 1, h: 3, c: [4, 4, 4, 3], r: 21 },
  { x: 11, y: 39, w: 1, h: 3, c: [4, 4, 4, 3], r: 21 },
  { x: 11, y: 42, w: 1, h: 3, c: [4, 4, 4, 3], r: 21 },
  { x: 11, y: 45, w: 1, h: 3, c: [4, 4, 4, 3], r: 21 },
  { x: 13, y: 3, w: 1, h: 3, c: [2, 5, 3], r: 21 },
  { x: 13, y: 6, w: 1, h: 3, c: [2, 5, 3], r: 21 },
  { x: 13, y: 10, w: 1, h: 3, c: [4, 4, 4, 4, 4], r: 21 },
  { x: 13, y: 13, w: 1, h: 3, c: [2, 5, 3], r: 21 },
  { x: 13, y: 16, w: 1, h: 3, c: [2, 5, 3], r: 21 },
  { x: 13, y: 19, w: 1, h: 3, c: [2, 5, 3], r: 21 },
  { x: 13, y: 22, w: 1, h: 3, c: [2, 5, 3], r: 21 },
  { x: 13, y: 25, w: 1, h: 3, c: [2, 5, 3], r: 21 },
  { x: 13, y: 30, w: 1, h: 3, c: [2, 5, 3], r: 21 },
  { x: 13, y: 33, w: 1, h: 3, c: [2, 5, 3], r: 21 },
  { x: 13, y: 36, w: 1, h: 3, c: [2, 5, 3], r: 21 },
  { x: 13, y: 39, w: 1, h: 3, c: [2, 5, 3], r: 21 },
  { x: 13, y: 42, w: 1, h: 3, c: [2, 5, 3], r: 21 },
  { x: 13, y: 45, w: 1, h: 3, c: [2, 5, 3], r: 21 },
];

/** Собрать модули этажа из компактного плана (свежие id при каждом посеве). */
function buildPlanModules(plan: PlanEntry[]): PlacedModule[] {
  return plan.map((e) => {
    if (e.t === "stairs") {
      const m = makeModule("stairs", e.x, e.y, { w: e.w, h: e.h });
      if (e.rw != null) m.realWidthCm = e.rw;
      if (e.rd != null) m.realDepthCm = e.rd;
      return m;
    }
    const m = withShelves(makeModule("section", e.x, e.y, { w: e.w, h: e.h }), e.c ?? []);
    if (e.r != null) m.row = e.r;
    return m;
  });
}

export function seedWarehouse(): Warehouse {
  const staff = seedStaff();
  return {
    id: uid("wh"),
    name: "Складская 5",
    kind: "mezzanine",
    address: "Москва, ул. Складская, 5",
    lat: 55.7558,
    lng: 37.6173,
    phone: "+7 495 120-45-90",
    email: "sklad1@uklad.ru",
    contactPerson: "Игорь Панов",
    staff,
    // Ответственное лицо — карточка по шаблону сотрудника (п.24).
    manager: { ...staff[0] },
    partners: seedPartners(),
    spec: seedSpec(),
    // Тариф хранения: рублей за занятую ячейку в сутки (п.10.5).
    floors: [{ id: uid("floor"), name: "Этаж 1", modules: buildPlanModules(WAREHOUSE_1_PLAN) }],
  };
}

/** Пустой склад с одним этажом — заготовка для «создать склад» (ТЗ, разд. 3.4). */
export function blankWarehouse(
  name: string,
  kind: WarehouseKind,
  address: string,
  coords?: { lat?: number; lng?: number },
): Warehouse {
  return {
    id: uid("wh"),
    name,
    kind,
    address,
    lat: coords?.lat,
    lng: coords?.lng,
    floors: [{ id: uid("floor"), name: "Этаж 1", modules: [] }],
    ownCatalog: true,
  };
}

/*
 * В демо один склад — «Складская 5», класс B+ (Кирилл 24.11: «оставим один,
 * зато наполненный»). Раньше рядом были «убитый» и «образцовый» склады для
 * разброса метрик; список складов с ними выглядел чужим, а не демо компании.
 */

/** Демо-аккаунт компании (ТЗ, разд. 3.2). */
export function seedAccount(): Account {
  return {
    type: "company",
    name: "Кирилл",
    org: "Уклад Логистика",
    title: "Администратор склада",
    // Банк для счёта продавцу: настоящий БИК и корсчёт, счёт придуман, но
    // ключ с БИК сходится — проверка в профиле его принимает.
    bik: "044525225",
    bankName: "ПАО Сбербанк",
    correspondentAccount: "30101810400000000225",
    bankAccount: "40702810938000071234",
  };
}

// Демо-значения доп.полей: часть полей сразу «используется», чтобы их удаление
// показывало предупреждение о потере данных (ТЗ, разд. 4) без ручного заполнения.
export const SEED_FIELD_VALUES: { sku: string; field: string; value: string }[] = [
  { sku: "УК-1001", field: "Размер", value: "XS" }, // Футболка XS
  { sku: "УК-1001", field: "Цвет", value: "Белый" },
  { sku: "УК-1003", field: "Размер", value: "M" }, // Футболка M
  { sku: "УК-1003", field: "Цвет", value: "Синий" },
  { sku: "УК-1010", field: "Размер", value: "L" }, // Джинсы L
  { sku: "УК-2001", field: "Гарантия, мес", value: "12" },
  { sku: "УК-2005", field: "Гарантия, мес", value: "24" },
  { sku: "УК-2010", field: "Гарантия, мес", value: "12" },
];

/**
 * Свой товар для демо-складов, кроме первого. Общий каталог из 237 позиций
 * лежит на активном складе; остальные склады видели его же, но с пустыми
 * полками, и карточка показывала «0%» при сотнях товаров. Теперь у каждого
 * свои позиции: копии части каталога со своим артикулом, штрихкодом,
 * партнёром склада и `warehouseId`. Раскладывает их вызывающий (`autoPlace`).
 */
export function seedOwnProducts(
  warehouse: Warehouse,
  catalog: Product[],
  skuPrefix: string,
  count: number,
  newId: () => string,
): Product[] {
  const partners = warehouse.partners ?? [];
  // Берём через одного, чтобы в выборку попали все категории, а не первая.
  const step = Math.max(1, Math.floor(catalog.length / count));
  const picked: Product[] = [];
  for (let i = 0; i < catalog.length && picked.length < count; i += step) picked.push(catalog[i]);
  return picked.map((p, i) => ({
    ...p,
    id: newId(),
    sku: p.sku.replace(/^[^-]*-/, `${skuPrefix}-`),
    barcode: generateEan13(),
    partnerId: partners.length ? partners[i % partners.length].id : undefined,
    warehouseId: warehouse.id,
  }));
}
