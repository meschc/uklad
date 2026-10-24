/**
 * Журнал событий кабинета — то, что поддержка видит, когда человек нажал
 * «Сообщить о проблеме».
 *
 * Пишется в браузере, кольцом: последние `MAX_ENTRIES` событий не старше
 * `MAX_AGE_MS`. Так он не растёт бесконечно и не тянет в обращение историю
 * полугодовой давности, которая к сбою отношения не имеет.
 *
 * Чего в журнале нет и быть не должно: введённых значений, имён, телефонов и
 * почт (план поддержки, п.2). Событие — это экран, действие или ошибка, а
 * детали — текст ошибки, прогнанный через `scrubText`. Ссылки на записи — по
 * номеру («товар #128»), не по названию.
 */

export type JournalKind = "view" | "action" | "error";

export interface JournalEntry {
  /** Время, мс с эпохи. */
  at: number;
  kind: JournalKind;
  /** Что случилось: экран, команда или источник ошибки. */
  name: string;
  /** Текст ошибки или номер записи — уже без контактов. */
  detail?: string;
}

export const JOURNAL_KEY = "uklad-journal-v1";
export const MAX_ENTRIES = 500;
export const MAX_AGE_MS = 7 * 86_400_000;
/** Длинный стек обрезаем: для разбора хватает верхних кадров. */
const MAX_DETAIL = 2000;

/** Узкий порт хранилища — в тестах его подменяет голый объект. */
export interface JournalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// Длины ограничены сверху: без этого строка в полмегабайта без «@» проверяется
// за квадратичное время, и вкладка зависает (нашёл тест на предел размера).
const EMAIL = /[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63}){1,8}/g;
// Телефон — 10–15 цифр с разделителями. Номера записей короче, их не трогаем.
const PHONE = /\+?\d[\d\s()-]{8,20}\d/g;
// ФИО с инициалами — так подписывают ИП и сотрудников в названиях поставок
// («Поставка 27.09 · Мамедова Л. Р.»): «Фамилия И. О.» и «И. О. Фамилия».
const INITIALS =
  /[А-ЯЁ][а-яё]{1,30}(?:-[А-ЯЁ][а-яё]{1,30})?\s[А-ЯЁ]\.\s?(?:[А-ЯЁ]\.)?|[А-ЯЁ]\.\s?(?:[А-ЯЁ]\.\s?)?[А-ЯЁ][а-яё]{1,30}/g;

/** Стереть из текста то, что похоже на почту или телефон. */
export function scrubText(text: string): string {
  return text
    .replace(EMAIL, "[почта]")
    .replace(INITIALS, "[ФИО]")
    .replace(PHONE, (m) => {
      const digits = m.replace(/\D/g, "");
      return digits.length >= 10 && digits.length <= 15 ? "[телефон]" : m;
    });
}

function browserStorage(): JournalStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    // Закрытое хранилище (приватное окно, запрет cookie) — журнал просто не пишется.
    return null;
  }
}

function isEntry(v: unknown): v is JournalEntry {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.at === "number" &&
    (e.kind === "view" || e.kind === "action" || e.kind === "error") &&
    typeof e.name === "string"
  );
}

export function createJournal(storage: JournalStorage | null = browserStorage()) {
  function read(now = Date.now()): JournalEntry[] {
    if (!storage) return [];
    try {
      const raw = JSON.parse(storage.getItem(JOURNAL_KEY) ?? "[]");
      if (!Array.isArray(raw)) return [];
      return raw.filter(isEntry).filter((e) => now - e.at <= MAX_AGE_MS);
    } catch {
      // Битый журнал не повод ронять кабинет: начинаем заново.
      return [];
    }
  }

  function record(kind: JournalKind, name: string, detail?: string, now = Date.now()) {
    if (!storage) return;
    const entry: JournalEntry = { at: now, kind, name: scrubText(name).slice(0, 200) };
    if (detail) entry.detail = scrubText(detail).slice(0, MAX_DETAIL);
    const next = [...read(now), entry].slice(-MAX_ENTRIES);
    try {
      storage.setItem(JOURNAL_KEY, JSON.stringify(next));
    } catch {
      // Хранилище переполнено. Журнал — вспомогательный, данные склада важнее:
      // уступаем им место, а не бросаем исключение посреди работы.
      try {
        storage.setItem(JOURNAL_KEY, JSON.stringify(next.slice(-50)));
      } catch {
        /* ничего не поделать */
      }
    }
  }

  function clear() {
    storage?.removeItem(JOURNAL_KEY);
  }

  return { read, record, clear };
}

export const journal = createJournal();

/** Текст и стек ошибки любого вида — для `detail`. */
export function describeError(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}\n${e.stack ?? ""}`.trim();
  return String(e);
}
