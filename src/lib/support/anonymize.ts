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
 * под правило, а не проскочить мимо него. Поэтому всё, что не названо явно,
 * всё равно проходит `scrubText` — почта или телефон в неожиданном месте
 * будут стёрты.
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
]);
/** Ключи-секреты под любым именем: на всякий случай шире, чем `DROP`. */
const SECRET = /token|secret|password|apikey|credential/i;

/** Свободный текст: оставляем только длину — по ней видно, было ли что-то. */
const FREE_TEXT = new Set(["text", "note", "comment"]);
const isFreeText = (key: string) => FREE_TEXT.has(key) || /Note$/.test(key);

/** Где `name` — имя человека или компании, и какой меткой его заменить. */
const PEOPLE: Record<string, string> = {
  staff: "Сотрудник",
  manager: "Сотрудник",
  partners: "Продавец",
  account: "Владелец",
  profile: "Владелец",
  user: "Пользователь",
};
/** У карточки владельца есть ещё название компании и подпись — тоже о нём. */
const OWNER_DROP = new Set(["org", "title"]);

export interface AnonymizeStats {
  /** Сколько имён заменено метками. */
  names: number;
  /** Сколько полей с контактами, реквизитами и ключами вырезано. */
  dropped: number;
  /** Сколько свободных текстов заменено пометкой. */
  texts: number;
}

export function anonymizeSnapshot(state: unknown): { data: unknown; stats: AnonymizeStats } {
  const stats: AnonymizeStats = { names: 0, dropped: 0, texts: 0 };
  // Одна и та же запись получает одну и ту же метку во всём снимке: сотрудник
  // в списке персонала и он же ответственный склада — «Сотрудник 2» оба раза.
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
    const owner = people === "Владелец";
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (DROP.has(k) || SECRET.test(k) || (owner && OWNER_DROP.has(k))) {
        if (v !== undefined && v !== "") stats.dropped += 1;
        continue;
      }
      if (people && k === "name" && typeof v === "string") {
        out[k] = label(people, obj.id);
        stats.names += 1;
        continue;
      }
      if (isFreeText(k) && typeof v === "string") {
        out[k] = v ? `[текст, ${v.length} симв.]` : "";
        if (v) stats.texts += 1;
        continue;
      }
      // Контекст «люди» действует на один уровень вглубь: имя у карточки
      // сотрудника, но не у склада, внутри которого лежит список персонала.
      out[k] = walk(v, PEOPLE[k] ?? null, k);
    }
    return out;
  }

  return { data: walk(state, null, ""), stats };
}
