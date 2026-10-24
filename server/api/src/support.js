/**
 * Разбор обращения «Сообщить о проблеме» (кабинет: `src/lib/support/report.ts`).
 *
 * Кабинет обезличивает журнал и снимок сам, до отправки. Сервер этому не
 * верит: браузер может быть старым, а запрос — собранным руками. Поэтому тело
 * целиком, каждая строка на любой глубине, ещё раз проходит `scrubText` —
 * почты, телефоны, ИНН и ФИО с инициалами стираются и здесь (`scrubDeep`).
 * Карточки людей сервер не разбирает — их модель знает кабинет, — но то, по
 * чему человека находят, в базу не ложится ни при каком клиенте.
 */
/* global module */

const MAX_MESSAGE = 4000;
const MAX_JOURNAL = 500;
const KINDS = new Set(["view", "action", "error"]);

// Длины ограничены сверху: без этого строка в полмегабайта без «@» проверяется
// за квадратичное время, и вкладка зависает (нашёл тест на предел размера).
const EMAIL = /[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63}){1,8}/g;
const PHONE = /\+?\d[\d\s()-]{8,20}\d/g;
// ФИО с инициалами — так подписывают ИП и сотрудников в названиях поставок
// («Поставка 27.09 · Мамедова Л. Р.»): «Фамилия И. О.» и «И. О. Фамилия».
const INITIALS =
  /[А-ЯЁ][а-яё]{1,30}(?:-[А-ЯЁ][а-яё]{1,30})?\s[А-ЯЁ]\.\s?(?:[А-ЯЁ]\.)?|[А-ЯЁ]\.\s?(?:[А-ЯЁ]\.\s?)?[А-ЯЁ][а-яё]{1,30}/g;

/**
 * То же правило, что `scrubText` в кабинете: вторая линия, а не первая.
 * Правило про телефон ловит любые 10–15 цифр подряд, а значит и ИНН (10 или
 * 12 цифр), и расчётный счёт стираются им же.
 */
function scrubText(text) {
  return text
    .replace(EMAIL, "[почта]")
    .replace(INITIALS, "[ФИО]")
    .replace(PHONE, (m) => {
      const digits = m.replace(/\D/g, "");
      return digits.length >= 10 && digits.length <= 15 ? "[телефон]" : m;
    });
}

// Коды товаров и тары: EAN-13 — тринадцать цифр, и без исключения правило про
// телефон стёрло бы штрихкод. То же исключение, что в кабинете (`anonymize.ts`).
const CODE_KEY = /^(barcode|ean|gtin|sku|code)$|(Code|Barcode)$/;
const PLAIN_CODE = /^[\w-]{1,64}$/;

/** Каждая строка на любой глубине — через `scrubText`, кроме чистых кодов. */
function scrubDeep(value, key = "") {
  if (typeof value === "string") {
    return CODE_KEY.test(key) && PLAIN_CODE.test(value) ? value : scrubText(value);
  }
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, key));
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = scrubDeep(v, k);
  return out;
}

const isObj = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);

function parseReport(raw) {
  if (!isObj(raw)) return { ok: false, error: "не объект" };
  if (raw.version !== 1) return { ok: false, error: "неизвестная версия" };
  if (typeof raw.message !== "string") return { ok: false, error: "нет сообщения" };
  const message = scrubText(raw.message.trim()).slice(0, MAX_MESSAGE);
  if (!message) return { ok: false, error: "пустое сообщение" };
  if (!isObj(raw.env)) return { ok: false, error: "нет сведений о браузере" };
  if (!Array.isArray(raw.journal) || raw.journal.length > MAX_JOURNAL) {
    return { ok: false, error: "журнал не того вида" };
  }
  for (const e of raw.journal) {
    if (!isObj(e) || typeof e.at !== "number" || !KINDS.has(e.kind) || typeof e.name !== "string") {
      return { ok: false, error: "запись журнала не того вида" };
    }
  }
  if (raw.snapshot !== undefined && !isObj(raw.snapshot)) {
    return { ok: false, error: "снимок не того вида" };
  }
  const view = typeof raw.env.view === "string" ? raw.env.view.slice(0, 40) : "";
  return {
    ok: true,
    report: {
      message,
      view,
      errors: raw.journal.filter((e) => e.kind === "error").length,
      hasSnapshot: raw.snapshot !== undefined,
    },
  };
}

module.exports = { parseReport, scrubText, scrubDeep };
