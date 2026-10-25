import { scrubText } from "./journal";

/**
 * Обезличенный снимок данных кабинета — то, что человек может приложить к
 * обращению, чтобы поддержка (и нейросеть) увидела склад таким, какой он есть.
 *
 * Принцип из плана поддержки и архитектуры данных: наружу уходят только номера
 * и структура. Имена людей заменяются метками («Сотрудник 3»), контакты,
 * реквизиты и ключи подключений вырезаются целиком, свободный текст (переписка,
 * заметки) — заменяется пометкой о длине. Товары, ячейки, остатки и операции
 * остаются: без них ошибку не воспроизвести, а персональных данных в них нет.
 *
 * Правила — по имени поля, а не по типу записи: снимок — это сохранённое
 * состояние стора целиком, и поле, добавленное в стор завтра, должно попасть
 * под правило, а не проскочить мимо него.
 *
 * Для карточек людей и компаний (персонал, продавцы, владелец, сессия) список
 * БЕЛЫЙ: остаются номера, роли, статусы, даты, числа и флаги, всё прочее
 * выкидывается. Новое поле «отчество» или «паспорт» завтра уйдёт молча, а не
 * утечёт. Для остального дерева (товары, ячейки, операции) — чёрный список
 * плюс `scrubText`: почта или телефон в неожиданном месте будут стёрты.
 */

/** Поля, которые вырезаются вместе со значением. */
const DROP = new Set([
  "phone",
  "email",
  "contact",
  "contactPerson",
  "inn",
  "kpp",
  "ogrn",
  "legalAddress",
  "photoUrl",
  "logoUrl",
  "login",
  "password",
  "token",
  "clientId",
  // ФИО под любым из привычных имён — на случай, если оно окажется вне карточки
  // человека, где и так действует белый список.
  "fio",
  "fullName",
  "firstName",
  "lastName",
  "middleName",
  "patronymic",
  // Реквизиты и документы.
  "bik",
  "snils",
  "passport",
  "rs",
  "ks",
  "bankAccount",
  "accountNumber",
  "correspondentAccount",
  "actualAddress",
  "postAddress",
  "postalAddress",
  // Где человек был: адрес машины и точка на карте.
  "ip",
  "ipAddress",
  "geo",
  "lat",
  "lng",
  "latitude",
  "longitude",
]);
/** Ключи-секреты под любым именем: на всякий случай шире, чем `DROP`. */
const SECRET = /token|secret|password|apikey|credential/i;

/** Свободный текст: оставляем только длину — по ней видно, было ли что-то. */
const FREE_TEXT = new Set(["text", "note", "comment", "description"]);
const isFreeText = (key: string) => FREE_TEXT.has(key) || /Note$/.test(key);

/** Где `name` — имя человека или компании, и какой меткой его заменить. */
const PEOPLE: Record<string, string> = {
  staff: "Сотрудник",
  manager: "Сотрудник",
  partners: "Продавец",
  account: "Владелец",
  profile: "Владелец",
  user: "Пользователь",
  session: "Пользователь",
};
/**
 * Что остаётся у карточки человека или компании: номера, роли, статусы, даты.
 * Числа, флаги и `null` остаются всегда — по ним видно состояние, а человека
 * по ним не найти. Имя заменяется меткой отдельно.
 */
const PERSON_KEEP =
  /^(id|role|status|kind|type|theme|lang|language|currency|plan|active|archived)$|Ids?$|At$|^(is|has)[A-Z]/;

/**
 * Коды товаров и тары: штрихкод EAN-13 — это тринадцать цифр подряд, и правило
 * про телефон стёрло бы его, а без кода не разобрать ошибку сканирования.
 * Код оставляем, если в нём нет ничего, кроме букв, цифр и дефиса.
 */
// Номера записей (`id`, `orderId`, `boxIds`) — тоже коды: номер заказа
// маркетплейса бывает десятью цифрами и иначе ушёл бы как «[телефон]».
const CODE_KEY = /^(id|barcode|ean|gtin|sku|article|code)$|(Id|Ids|Code|Barcode)$/;
const PLAIN_CODE = /^[\w-]{1,64}$/;

export interface AnonymizeStats {
  /** Сколько имён людей и компаний убрано (человек остаётся своим id). */
  names: number;
  /** Сколько полей с контактами, реквизитами и ключами вырезано. */
  dropped: number;
  /** Сколько свободных текстов заменено пометкой. */
  texts: number;
}

export function anonymizeSnapshot(state: unknown): { data: unknown; stats: AnonymizeStats } {
  const stats: AnonymizeStats = { names: 0, dropped: 0, texts: 0 };
  // Метки — только для адресов: у адреса нет своего id, а одинаковые ли это
  // места, по метке видно («Адрес 2» оба раза).
  const labels = new Map<string, string>();
  const counters = new Map<string, number>();

  function label(kind: string, id: unknown): string {
    const key =
      typeof id === "string" || typeof id === "number"
        ? `${kind}:${id}`
        : `${kind}:#${labels.size}`;
    let found = labels.get(key);
    if (!found) {
      const n = (counters.get(kind) ?? 0) + 1;
      counters.set(kind, n);
      found = `${kind} ${n}`;
      labels.set(key, found);
    }
    return found;
  }

  function walk(value: unknown, people: string | null, key: string): unknown {
    if (typeof value === "string" && CODE_KEY.test(key) && PLAIN_CODE.test(value)) return value;
    if (typeof value === "string") {
      // Адрес склада и получатель заявки — места, а не люди, но по ним легко
      // найти человека. Метка сохраняет главное: одинаковые ли это адреса.
      if (key === "address" || key === "destination") return value ? label("Адрес", value) : value;
      if (key === "vehicle") return value ? "[машина]" : value;
      return scrubText(value);
    }
    if (Array.isArray(value)) return value.map((v) => walk(v, people, key));
    if (!value || typeof value !== "object") return value;

    const obj = value as Record<string, unknown>;
    if (people) return person(obj, people);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (DROP.has(k) || SECRET.test(k)) {
        if (v !== undefined && v !== "") stats.dropped += 1;
        continue;
      }
      if (isFreeText(k) && typeof v === "string") {
        out[k] = v ? `[текст, ${v.length} симв.]` : "";
        if (v) stats.texts += 1;
        continue;
      }
      out[k] = walk(v, PEOPLE[k] ?? null, k);
    }
    return out;
  }

  /** Карточка человека или компании — по белому списку. */
  function person(obj: Record<string, unknown>, kind: string): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === "name" && typeof v === "string") {
        // Имя не уходит вовсе: человека в обращении узнают по его id — тому же
        // номеру, что в журнале смены, рейсах и приёмке (решение Кирилла
        // 25.10). Метка «Сотрудник 3» связи с остальными данными не давала.
        if (v) stats.names += 1;
      } else if (v === null || typeof v === "number" || typeof v === "boolean") {
        out[k] = v;
      } else if (PERSON_KEEP.test(k) && !SECRET.test(k)) {
        // Вложенное (список складов, `user` внутри сессии) — тем же правилом:
        // у вложенной карточки свой вид, если он назван, иначе вид родителя.
        out[k] = walk(v, PEOPLE[k] ?? kind, k);
      } else if (PEOPLE[k] && v && typeof v === "object") {
        out[k] = walk(v, PEOPLE[k], k);
      } else if (v !== undefined && v !== "") {
        stats.dropped += 1;
      }
    }
    return out;
  }

  return { data: walk(state, null, ""), stats };
}
