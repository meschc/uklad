/**
 * Описания внешних систем (п.22, п.9). Здесь только то, что нужно знать
 * ЗАРАНЕЕ: адрес API, способ авторизации и обязательные поля подключения. Ключи
 * и токены вводит владелец склада; в прототипе они лежат в localStorage и
 * наружу не уходят.
 *
 * Ссылки ведут на порталы разработчика вендоров там, где такой портал заведомо
 * есть; где адрес документации у вендора закрыт за кабинетом партнёра — на
 * корневой сайт. Придумывать правдоподобный URL нельзя: неверная ссылка в
 * интерфейсе хуже честной ссылки на главную.
 *
 * Знак партнёра — логотип вендора из `public/brands`, если он у нас есть, иначе
 * монограмма в фирменном цвете. Логотип используется номинативно: обозначить,
 * с какой именно системой идёт обмен. Логотипов меньше, чем интеграций, поэтому
 * монограмма остаётся рабочим вариантом, а не заглушкой на время.
 */

export type AuthKind = "basic" | "token" | "oauth" | "none";

/** Раздел списка: маркетплейсы, учётные системы, доставка, государство. */
export type IntegrationCategory = "market" | "erp" | "delivery" | "gov";

export interface IntegrationField {
  /** Ключ в конфиге подключения. */
  id: keyof IntegrationConfig & string;
  labelKey: string;
  placeholder?: string;
  /** Значение скрывается точками и не показывается в открытую. */
  secret?: boolean;
}

/** Знак партнёра: логотип, если он есть, иначе монограмма на фирменном цвете. */
export interface BrandMarkSpec {
  short: string;
  /** Фон плитки. */
  bg: string;
  /** Цвет букв; по умолчанию белый. */
  fg?: string;
  /**
   * Имя файла в `public/brands` — например `ozon.svg`. Без него рисуется
   * монограмма; если файл не загрузился, интерфейс тоже падает на монограмму,
   * а не показывает дыру.
   */
  logo?: string;
}

export interface IntegrationSpec {
  id: string;
  category: IntegrationCategory;
  /** Название вендора — печатается как есть, без перевода. */
  title: string;
  brand: BrandMarkSpec;
  /** Что именно даёт интеграция складу. */
  descriptionKey: string;
  /** Документация вендора — открывается в новой вкладке. */
  docsUrl: string;
  auth: AuthKind;
  /** Базовый адрес API по умолчанию (можно переопределить). */
  defaultBaseUrl?: string;
  fields: IntegrationField[];
}

/** Значения подключения. Все поля необязательны: заполняются по мере готовности. */
export interface IntegrationConfig {
  enabled?: boolean;
  baseUrl?: string;
  login?: string;
  password?: string;
  token?: string;
  clientId?: string;
  warehouseId?: string;
  note?: string;
}

const FIELD_BASE: IntegrationField = {
  id: "baseUrl",
  labelKey: "integr.field.baseUrl",
};
const FIELD_TOKEN: IntegrationField = {
  id: "token",
  labelKey: "integr.field.token",
  secret: true,
};
const FIELD_WAREHOUSE: IntegrationField = {
  id: "warehouseId",
  labelKey: "integr.field.warehouseId",
};
/** Типовой набор «адрес + токен + склад» — под него подходит большинство API. */
const TOKEN_SET: IntegrationField[] = [FIELD_BASE, FIELD_TOKEN, FIELD_WAREHOUSE];
/** Набор перевозчика: склада на его стороне нет, есть договор и ключ. */
const CARRIER_SET: IntegrationField[] = [
  FIELD_BASE,
  { id: "clientId", labelKey: "integr.field.contract" },
  FIELD_TOKEN,
];

export const INTEGRATIONS: IntegrationSpec[] = [
  // --- Маркетплейсы ---------------------------------------------------------
  {
    id: "ozon",
    category: "market",
    title: "Ozon Seller API",
    brand: { short: "OZ", bg: "#005BFF", logo: "ozon.svg" },
    descriptionKey: "integr.ozon.desc",
    docsUrl: "https://docs.ozon.ru/api/seller/",
    auth: "token",
    defaultBaseUrl: "https://api-seller.ozon.ru",
    fields: [
      FIELD_BASE,
      { id: "clientId", labelKey: "integr.field.clientId" },
      { id: "token", labelKey: "integr.field.apiKey", secret: true },
      FIELD_WAREHOUSE,
    ],
  },
  {
    id: "wildberries",
    category: "market",
    title: "Wildberries",
    brand: { short: "WB", bg: "#CB11AB", logo: "wildberries.svg" },
    descriptionKey: "integr.wb.desc",
    docsUrl: "https://dev.wildberries.ru/openapi/api-information",
    auth: "token",
    defaultBaseUrl: "https://marketplace-api.wildberries.ru",
    fields: TOKEN_SET,
  },
  {
    id: "yandex-market",
    category: "market",
    title: "Яндекс Маркет",
    brand: {
      short: "ЯМ",
      bg: "#FFDB4D",
      fg: "#111111",
      logo: "yandex-market.svg",
    },
    descriptionKey: "integr.ym.desc",
    docsUrl: "https://yandex.ru/dev/market/partner-api/doc/ru/",
    auth: "token",
    defaultBaseUrl: "https://api.partner.market.yandex.ru",
    fields: [
      FIELD_BASE,
      { id: "clientId", labelKey: "integr.field.campaignId" },
      FIELD_TOKEN,
      FIELD_WAREHOUSE,
    ],
  },
  {
    id: "megamarket",
    category: "market",
    title: "Мегамаркет",
    // Зелёный остался от «СберМегаМаркета»: после ребрендинга знак фиолетовый.
    brand: { short: "ММ", bg: "#8654CC", logo: "megamarket.png" },
    descriptionKey: "integr.mm.desc",
    docsUrl: "https://megamarket.ru/",
    auth: "token",
    fields: TOKEN_SET,
  },
  {
    id: "avito",
    category: "market",
    title: "Авито",
    brand: { short: "АВ", bg: "#00AAFF", logo: "avito.svg" },
    descriptionKey: "integr.avito.desc",
    docsUrl: "https://developers.avito.ru/",
    auth: "oauth",
    defaultBaseUrl: "https://api.avito.ru",
    fields: [
      FIELD_BASE,
      { id: "clientId", labelKey: "integr.field.clientId" },
      { id: "token", labelKey: "integr.field.clientSecret", secret: true },
    ],
  },
  {
    id: "lamoda",
    category: "market",
    title: "Lamoda",
    brand: { short: "LA", bg: "#0F0F0F", logo: "lamoda.svg" },
    descriptionKey: "integr.lamoda.desc",
    docsUrl: "https://www.lamoda.ru/",
    auth: "token",
    fields: TOKEN_SET,
  },
  {
    id: "aliexpress",
    category: "market",
    title: "AliExpress",
    brand: { short: "AE", bg: "#FF2751", logo: "aliexpress.png" },
    descriptionKey: "integr.ali.desc",
    docsUrl: "https://openservice.aliexpress.com/",
    auth: "oauth",
    fields: [
      FIELD_BASE,
      { id: "clientId", labelKey: "integr.field.appKey" },
      { id: "token", labelKey: "integr.field.appSecret", secret: true },
    ],
  },

  // --- Учётные системы и CRM ------------------------------------------------
  {
    id: "1c",
    category: "erp",
    title: "1С:Предприятие 8",
    brand: { short: "1С", bg: "#FFCC00", fg: "#111111", logo: "1c.svg" },
    descriptionKey: "integr.1c.desc",
    // OData-интерфейс автоматически публикуется конфигурацией «1С:Предприятие 8».
    docsUrl: "https://its.1c.ru/db/v8323doc#bookmark:dev:TI000001358",
    auth: "basic",
    defaultBaseUrl: "http://server/base/odata/standard.odata",
    fields: [
      FIELD_BASE,
      { id: "login", labelKey: "integr.field.login" },
      { id: "password", labelKey: "integr.field.password", secret: true },
      FIELD_WAREHOUSE,
    ],
  },
  {
    id: "moysklad",
    category: "erp",
    title: "МойСклад",
    brand: { short: "МС", bg: "#1B75BB", logo: "moysklad.svg" },
    descriptionKey: "integr.moysklad.desc",
    docsUrl: "https://dev.moysklad.ru/doc/api/remap/1.2/",
    auth: "token",
    defaultBaseUrl: "https://api.moysklad.ru/api/remap/1.2",
    fields: TOKEN_SET,
  },
  {
    id: "bitrix24",
    category: "erp",
    title: "Битрикс24",
    brand: { short: "Б24", bg: "#2FC7F7", fg: "#0B2740", logo: "bitrix24.svg" },
    descriptionKey: "integr.bitrix.desc",
    docsUrl: "https://apidocs.bitrix24.ru/",
    auth: "oauth",
    fields: [
      FIELD_BASE,
      { id: "clientId", labelKey: "integr.field.clientId" },
      { id: "token", labelKey: "integr.field.webhook", secret: true },
    ],
  },
  {
    id: "retailcrm",
    category: "erp",
    title: "RetailCRM",
    brand: { short: "RC", bg: "#0068FF", logo: "retailcrm.svg" },
    descriptionKey: "integr.retailcrm.desc",
    docsUrl: "https://docs.retailcrm.ru/",
    auth: "token",
    fields: TOKEN_SET,
  },
  {
    id: "insales",
    category: "erp",
    title: "InSales",
    brand: { short: "IS", bg: "#FF6B00", logo: "insales.svg" },
    descriptionKey: "integr.insales.desc",
    docsUrl: "https://api.insales.ru/",
    auth: "basic",
    fields: [
      FIELD_BASE,
      { id: "login", labelKey: "integr.field.login" },
      { id: "password", labelKey: "integr.field.password", secret: true },
    ],
  },
  {
    id: "ava",
    category: "erp",
    title: "АВА",
    brand: { short: "AVA", bg: "#4B5563" },
    descriptionKey: "integr.ava.desc",
    docsUrl: "https://ava.ru/",
    auth: "token",
    fields: [FIELD_BASE, FIELD_TOKEN],
  },

  // --- Доставка -------------------------------------------------------------
  {
    id: "cdek",
    category: "delivery",
    title: "СДЭК",
    brand: { short: "СД", bg: "#1AB248", logo: "cdek.svg" },
    descriptionKey: "integr.cdek.desc",
    docsUrl: "https://api-docs.cdek.ru/",
    auth: "oauth",
    defaultBaseUrl: "https://api.cdek.ru/v2",
    fields: [
      FIELD_BASE,
      { id: "clientId", labelKey: "integr.field.account" },
      { id: "token", labelKey: "integr.field.secureKey", secret: true },
    ],
  },
  {
    id: "boxberry",
    category: "delivery",
    title: "Boxberry",
    brand: { short: "BB", bg: "#ED1C24", logo: "boxberry.png" },
    descriptionKey: "integr.boxberry.desc",
    docsUrl: "https://boxberry.ru/",
    auth: "token",
    fields: CARRIER_SET,
  },
  {
    id: "pochta",
    category: "delivery",
    title: "Почта России",
    brand: { short: "ПР", bg: "#0060A9", logo: "pochta.png" },
    descriptionKey: "integr.pochta.desc",
    docsUrl: "https://otpravka.pochta.ru/specification",
    auth: "token",
    defaultBaseUrl: "https://otpravka-api.pochta.ru",
    fields: CARRIER_SET,
  },
  {
    id: "dellin",
    category: "delivery",
    title: "Деловые линии",
    brand: { short: "ДЛ", bg: "#D6001C", logo: "dellin.svg" },
    descriptionKey: "integr.dellin.desc",
    docsUrl: "https://dev.dellin.ru/",
    auth: "token",
    defaultBaseUrl: "https://api.dellin.ru",
    fields: CARRIER_SET,
  },
  {
    id: "pek",
    category: "delivery",
    title: "ПЭК",
    brand: { short: "ПЭК", bg: "#E30613", logo: "pek.png" },
    descriptionKey: "integr.pek.desc",
    docsUrl: "https://pecom.ru/",
    auth: "token",
    fields: CARRIER_SET,
  },
  {
    id: "yandex-delivery",
    category: "delivery",
    title: "Яндекс Доставка",
    brand: { short: "ЯД", bg: "#FC3F1D", logo: "yandex-delivery.svg" },
    descriptionKey: "integr.ydelivery.desc",
    docsUrl: "https://yandex.ru/dev/logistics/delivery/",
    auth: "token",
    fields: CARRIER_SET,
  },

  // --- Государственные системы ----------------------------------------------
  {
    id: "honest-sign",
    category: "gov",
    title: "Честный знак",
    brand: { short: "ЧЗ", bg: "#0E4C92", logo: "honest-sign.png" },
    descriptionKey: "integr.chz.desc",
    docsUrl: "https://честныйзнак.рф/business/projects/",
    auth: "oauth",
    defaultBaseUrl: "https://markirovka.crpt.ru/api/v3",
    fields: [
      FIELD_BASE,
      { id: "clientId", labelKey: "integr.field.orgInn" },
      { id: "token", labelKey: "integr.field.certToken", secret: true },
    ],
  },
  {
    id: "diadoc",
    category: "gov",
    title: "Диадок",
    brand: { short: "ДД", bg: "#00CBA6", logo: "diadoc.png" },
    descriptionKey: "integr.diadoc.desc",
    docsUrl: "https://api-docs.diadoc.ru/",
    auth: "oauth",
    fields: [
      FIELD_BASE,
      { id: "clientId", labelKey: "integr.field.orgInn" },
      { id: "token", labelKey: "integr.field.certToken", secret: true },
    ],
  },
];

export const INTEGRATION_CATEGORIES: {
  id: IntegrationCategory;
  key: string;
}[] = [
  { id: "market", key: "integr.cat.market" },
  { id: "erp", key: "integr.cat.erp" },
  { id: "delivery", key: "integr.cat.delivery" },
  { id: "gov", key: "integr.cat.gov" },
];
