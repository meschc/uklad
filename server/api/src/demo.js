/**
 * Персональные демо-ссылки.
 *
 * Человек оставляет заявку «Демо» с почтой — сервер отвечает ему письмом со
 * ссылкой `https://u-klad.ru/d/<токен>`. Ссылка ставит браузеру куку-пропуск
 * и ведёт в кабинет (`/app/`), а нам говорит, открыли ли демо и сколько раз.
 * Кабинет в сборке с сервером без входа закрыт и открывает демо, только
 * если `GET /api/demo/pass` подтвердил пропуск (`server.js`, `App.tsx`).
 * Демо-склад живёт в браузере, ничьих данных ссылка не открывает — она
 * знакомит с продуктом и проверяет, что почта настоящая. Демо по почте, а
 * не сразу на странице, — решение Кирилла.
 */
/* global require, module */
/* eslint-disable @typescript-eslint/no-require-imports */
const { randomBytes } = require("node:crypto");

/** 128 бит из криптографического генератора — перебором не угадать. */
function newToken() {
  return randomBytes(16).toString("base64url");
}

const TOKEN = /^[A-Za-z0-9_-]{22}$/;

function isToken(value) {
  return typeof value === "string" && TOKEN.test(value);
}

function demoLetter({ lang, link, days }) {
  if (lang === "en") {
    return {
      subject: "Your Uklad demo",
      text:
        `Hello!\n\nHere is your personal link to the Uklad demo:\n${link}\n\n` +
        `It works for ${days} days. The demo warehouse lives in your browser, ` +
        `so try anything: nothing will break.\n\n` +
        `If you did not request it, just ignore this email.\n`,
    };
  }
  return {
    subject: "Ваше демо Уклада",
    text:
      `Здравствуйте!\n\nВот ваша личная ссылка на демо Уклада:\n${link}\n\n` +
      `Она работает ${days} дней. Демо-склад живёт в вашем браузере, так что ` +
      `пробуйте что угодно: ничего не сломается.\n\n` +
      `Если вы не оставляли заявку, просто не отвечайте на это письмо.\n`,
  };
}

module.exports = { newToken, isToken, demoLetter };
