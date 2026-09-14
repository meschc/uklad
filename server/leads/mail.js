/**
 * Отправка письма по SMTP.
 *
 * Пароль ящика живёт в переменных окружения функции — то есть на сервере, за
 * пределами всего, что уезжает в браузер. Это и есть причина, по которой
 * приёмник заявок вообще написан отдельно, а не сведён к вебхуку прямо из
 * формы: адрес приёмника Vite подставляет в бандл открытым текстом, и любой
 * токен, оказавшийся в этом адресе, был бы опубликован вместе с сайтом.
 */
// Про CommonJS и объявления ниже — см. шапку `index.js`.
/* global require, module, process */
/* eslint-disable @typescript-eslint/no-require-imports */
const nodemailer = require("nodemailer");

/** Яндекс.Почта: SMTP на 465 через SSL. Порт 587 у неё тоже есть, но со STARTTLS. */
const DEFAULT_HOST = "smtp.yandex.ru";
const DEFAULT_PORT = 465;
const SSL_PORT = 465;

/**
 * Адрес электронной почты — намеренно грубая проверка.
 *
 * Задача не «признать все адреса из RFC 5322», а не пустить в заголовок
 * письма пробел, запятую или перевод строки: из них собирается подстановка
 * чужих получателей. Что адрес существует, всё равно выяснится доставкой.
 */
const EMAIL = /^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/;

/**
 * Настройки читаются один раз и проверяются сразу.
 *
 * Молчаливое «письмо не ушло» — худший исход для формы: отправитель видит
 * «спасибо», а заявки нет. Поэтому недостача переменной валит функцию на
 * старте, а не на первом человеке, который что-то написал.
 */
function readConfig() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const to = process.env.MAIL_TO;

  const missing = [
    ["SMTP_USER", user],
    ["SMTP_PASSWORD", pass],
    ["MAIL_TO", to],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length) {
    throw new Error(`не заданы переменные окружения: ${missing.join(", ")}`);
  }

  const port = Number(process.env.SMTP_PORT ?? DEFAULT_PORT);
  return {
    host: process.env.SMTP_HOST ?? DEFAULT_HOST,
    port,
    secure: port === SSL_PORT,
    user,
    pass,
    to,
    from: process.env.MAIL_FROM ?? user,
  };
}

/**
 * Транспорт переживает вызов.
 *
 * Облако держит контейнер функции тёплым между запросами, и поднимать SSL-
 * соединение заново на каждую заявку — лишняя секунда там, где человек ждёт
 * ответа формы. Первый вызов создаёт, остальные переиспользуют.
 */
let transport = null;
let config = null;

function ensureTransport() {
  if (!transport) {
    config = readConfig();
    transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
    });
  }
  return transport;
}

/**
 * Адрес для кнопки «Ответить».
 *
 * Заявка приходит с ящика сервиса на ящик сервиса, поэтому без `Reply-To`
 * ответ ушёл бы самому себе. Берём первое значение полей, похожее на адрес:
 * подпись поля на витрине переводится, а формат адреса — нет.
 */
function replyTo(fields) {
  const found = fields.find((f) => EMAIL.test(f.value));
  return found ? found.value : undefined;
}

async function sendLetter({ subject, text, fields }) {
  const mailer = ensureTransport();
  await mailer.sendMail({
    from: config.from,
    to: config.to,
    replyTo: replyTo(fields),
    subject,
    text,
  });
}

module.exports = { sendLetter };
