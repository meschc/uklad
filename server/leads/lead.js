/**
 * Разбор и проверка заявки с витрины.
 *
 * Тело запроса собирает `src/site/lib/leads.ts` — это единственный контракт
 * между витриной и приёмником, и менять его надо синхронно с обеих сторон.
 * Здесь он проверяется целиком, а не «на глаз»: обработчик открыт в интернет,
 * его адрес лежит в бандле открытым текстом, и прийти в него может что угодно.
 *
 * Проверка отвечает на три разных вопроса, и путать их нельзя:
 *
 *  - форма данных (то ли вообще прислали) — иначе письмо соберётся из мусора;
 *  - размеры (не прислали ли мегабайт) — иначе почтовый ящик забьётся с одного
 *    запроса, а функция упрётся в лимит памяти;
 *  - согласие на обработку (`consent.data`) — без него обработку персональных
 *    данных начинать нельзя вовсе, ч. 1 ст. 9 152-ФЗ. Витрина без галочки
 *    отправить не даёт, но проверять это на стороне браузера бессмысленно.
 */

// Про CommonJS и объявления ниже — см. шапку `index.js`.
/* global module */

/** Виды заявок — ровно те же, что в `LeadKind` на витрине. */
const KINDS = ["contact", "request", "complaint", "vote", "idea"];

/** Языки витрины. Заявка приходит на том, на котором её заполняли. */
const LANGS = ["ru", "en"];

// Пределы. Не «на всякий случай», а по смыслу поля: тема — строка заголовка
// письма, сообщение — письмо целиком, адрес страницы — ссылка.
const MAX_SUBJECT = 300;
const MAX_MESSAGE = 8_000;
const MAX_PAGE = 2_000;
const MAX_FIELDS = 30;
const MAX_FIELD_LABEL = 200;
const MAX_FIELD_VALUE = 2_000;

function isFilledString(value, limit) {
  return typeof value === "string" && value.trim() !== "" && value.length <= limit;
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Поля заявки: пары «подпись — значение» в том порядке, в каком их заполняли.
 * Пустые отбрасываются — витрина их и не шлёт, но заявка могла прийти не с неё.
 */
function parseFields(raw) {
  if (raw === undefined) return [];
  if (!isPlainObject(raw)) return null;

  const entries = Object.entries(raw);
  if (entries.length > MAX_FIELDS) return null;

  const fields = [];
  for (const [label, value] of entries) {
    if (label.length > MAX_FIELD_LABEL) return null;
    if (typeof value !== "string" || value.length > MAX_FIELD_VALUE) return null;
    if (value.trim() !== "") fields.push({ label, value: value.trim() });
  }
  return fields;
}

/**
 * Разобранная заявка или причина отказа.
 *
 * Причина уходит в журнал функции, а не в ответ браузеру: наружу отдаётся
 * только код состояния. Подробный разбор того, какая проверка не прошла, —
 * это подсказка тому, кто подбирает обход, и никакой пользы отправителю.
 */
function parseLead(raw) {
  if (!isPlainObject(raw)) return { ok: false, error: "тело запроса не объект" };

  const { kind, lang, subject, page, consent, message } = raw;

  if (!KINDS.includes(kind)) return { ok: false, error: `неизвестный вид заявки: ${kind}` };
  if (!LANGS.includes(lang)) return { ok: false, error: `неизвестный язык: ${lang}` };
  if (!isFilledString(subject, MAX_SUBJECT)) return { ok: false, error: "тема пуста или длинна" };
  if (!isFilledString(message, MAX_MESSAGE)) return { ok: false, error: "письмо пусто или длинно" };

  if (page !== undefined && (typeof page !== "string" || page.length > MAX_PAGE)) {
    return { ok: false, error: "адрес страницы не строка или длинён" };
  }

  if (!isPlainObject(consent) || consent.data !== true) {
    return { ok: false, error: "нет согласия на обработку персональных данных" };
  }

  const fields = parseFields(raw.fields);
  if (fields === null) return { ok: false, error: "поля заявки не разобрались" };

  return {
    ok: true,
    lead: {
      kind,
      lang,
      subject: subject.trim(),
      page: typeof page === "string" ? page : "",
      consent: { data: true, ads: consent.ads === true },
      fields,
      message: message.trim(),
    },
  };
}

/**
 * Тема письма.
 *
 * Переводы строк вырезаются, и это не косметика: тема уходит в заголовок
 * письма, а перевод строки внутри заголовка — классическая подстановка чужих
 * заголовков в SMTP. Nodemailer кодирует тему сам, но полагаться на одну
 * защиту там, где ничего не стоит поставить вторую, не стоит.
 */
function letterSubject(lead) {
  return lead.subject.replace(/[\r\n]+/g, " ").slice(0, MAX_SUBJECT);
}

/**
 * Тело письма.
 *
 * `message` витрина собирает сама — человеческим текстом, с подписями полей,
 * отметкой о согласии и адресом страницы. Здесь к нему добавляется только то,
 * чего отправитель знать не мог: вид заявки и язык, на котором её заполняли.
 * Отвечать на английскую заявку по-русски — плохо, а из текста это не всегда
 * видно.
 */
function letterText(lead) {
  const head = [`Вид заявки: ${lead.kind}`, `Язык: ${lead.lang}`];
  if (lead.page) head.push(`Страница: ${lead.page}`);
  return `${head.join("\n")}\n\n${lead.message}\n`;
}

module.exports = { parseLead, letterSubject, letterText, KINDS, LANGS };
