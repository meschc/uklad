/**
 * Приёмник заявок с витрины — функция Яндекс Облака.
 *
 * Витрина — статика на GitHub Pages, у неё нет своего сервера. Формы шлют
 * `POST` с телом JSON по адресу из `VITE_LEADS_ENDPOINT`, и на том конце
 * нужен кто-то, кто примет заявку и положит её человеку в почту. Этот кто-то —
 * здесь.
 *
 * Почему функция, а не вебхук CRM. Vite подставляет значение переменной с
 * префиксом `VITE_` прямо в собранный код, открытым текстом: адрес приёмника
 * виден каждому, кто откроет исходник страницы. Вебхук Битрикс24 или amoCRM
 * носит токен прямо в адресе — опубликовать его значит отдать чужому человеку
 * право писать в CRM. У функции в адресе нет ничего, кроме её идентификатора,
 * а пароль почтового ящика лежит в переменных окружения на стороне облака.
 *
 * Почему в России. Пока приёмника не было, заявки уходили через `mailto:` и
 * нигде не накапливались. Как только их начинает принимать сервер, появляется
 * обработка персональных данных, а ч. 5 ст. 18 152-ФЗ требует, чтобы база с
 * данными россиян находилась на территории России. Яндекс Облако ей отвечает;
 * зарубежная функция — нет, независимо от того, где лежит статика сайта.
 *
 * Развёртывание и переменные окружения — в README рядом.
 */
// Модули здесь CommonJS: таков рантайм функций Яндекс Облака. Линтер проекта
// настроен на браузерный TypeScript, поэтому имена окружения Node объявляются
// прямо в файле, а запрет на `require` для этой папки снимается.
/* global require, module, process, console, Buffer */
/* eslint-disable @typescript-eslint/no-require-imports */
const { parseLead, letterSubject, letterText } = require("./lead");
const { sendLetter } = require("./mail");

/**
 * Откуда принимаем. Список через запятую: кроме боевого домена в нём бывает
 * нужен адрес локальной разработки, когда форму проверяют вживую.
 *
 * Это не рубеж обороны: заголовок `Origin` ставит браузер, и запрос из
 * консоли пришлёт любой. Он отсекает случайное — чужую страницу, встроившую
 * нашу форму себе, — и ровно на это и рассчитан.
 */
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGIN ?? "https://u-klad.ru")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

/**
 * Предел на тело запроса.
 *
 * Заявка с витрины — несколько килобайт текста; всё, что заметно больше,
 * прислано не формой. Предел стоит до разбора JSON: разбирать мегабайт, чтобы
 * потом отказать по длине поля, — уже проигранная гонка.
 */
const MAX_BODY_BYTES = 32 * 1024;

/** Сколько браузеру можно не переспрашивать разрешение. Сутки — потолок Chrome. */
const PREFLIGHT_MAX_AGE = 86_400;

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Access-Control-Max-Age": String(PREFLIGHT_MAX_AGE),
    Vary: "Origin",
  };
}

function reply(statusCode, origin, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(origin ? corsHeaders(origin) : {}),
    },
    body: JSON.stringify(payload),
  };
}

/**
 * Тело запроса строкой.
 *
 * Облако отдаёт его либо как есть, либо в base64 — признак приходит в самом
 * событии. Длину меряем в байтах, а не в символах: кириллица в UTF-8 занимает
 * два байта на букву, и предел «по символам» пропустил бы вдвое больше.
 */
function readBody(event) {
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body ?? "", "base64")
    : Buffer.from(event.body ?? "", "utf8");
  if (raw.length > MAX_BODY_BYTES) return { ok: false, error: `тело ${raw.length} Б` };
  return { ok: true, text: raw.toString("utf8") };
}

module.exports.handler = async function handler(event) {
  const origin = event.headers?.Origin ?? event.headers?.origin ?? "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : "";
  const method = event.httpMethod ?? "";

  // Предварительный запрос браузера. Он идёт всегда: заголовок
  // `Content-Type: application/json` выводит запрос из числа простых, и без
  // ответа на `OPTIONS` форма не отправится ни разу.
  if (method === "OPTIONS") {
    if (!allowed) return { statusCode: 403, body: "" };
    return { statusCode: 204, headers: corsHeaders(allowed), body: "" };
  }

  if (method !== "POST") return reply(405, allowed, { ok: false });

  if (!allowed) {
    console.error("[uklad] заявка с чужого источника:", origin || "(пусто)");
    return reply(403, "", { ok: false });
  }

  const body = readBody(event);
  if (!body.ok) {
    console.error("[uklad] заявка не принята:", body.error);
    return reply(413, allowed, { ok: false });
  }

  let raw;
  try {
    raw = JSON.parse(body.text);
  } catch {
    console.error("[uklad] заявка не разобралась: тело не JSON");
    return reply(400, allowed, { ok: false });
  }

  const parsed = parseLead(raw);
  if (!parsed.ok) {
    // Причина уходит в журнал функции, а не отправителю: подробный разбор
    // того, какая проверка не прошла, полезен только тому, кто её обходит.
    console.error("[uklad] заявка не принята:", parsed.error);
    return reply(400, allowed, { ok: false });
  }

  const { lead } = parsed;
  try {
    await sendLetter({
      subject: letterSubject(lead),
      text: letterText(lead),
      fields: lead.fields,
    });
  } catch (error) {
    // Витрина покажет «не вышло» и предложит письмо — заявка не потеряется,
    // но разбираться с почтой надо по этой записи в журнале.
    console.error("[uklad] письмо не ушло:", error);
    return reply(502, allowed, { ok: false });
  }

  return reply(200, allowed, { ok: true });
};
