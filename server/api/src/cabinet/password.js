/**
 * Пароли кабинета. Формат тот же, что у админки (`admin/password.js`):
 * `scrypt$N$r$p$соль$хэш`. Разница одна — здесь scrypt асинхронный: вход в
 * кабинет идёт потоком, и синхронный расчёт на ~100 мс держал бы весь сервер.
 */
/* global require, module, Buffer */
/* eslint-disable @typescript-eslint/no-require-imports */
const { scrypt, randomBytes, timingSafeEqual } = require("node:crypto");

const N = 2 ** 15;
const R = 8;
const P = 1;
const LEN = 32;
const MAXMEM = 64 * 1024 * 1024;
const MIN_LENGTH = 10;
const MAX_LENGTH = 1024;

// Для неизвестной почты всё равно считаем scrypt: время ответа не выдаёт,
// есть ли такая учётная запись.
const DUMMY = `scrypt$${N}$${R}$${P}$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;

function derive(password, salt, len, opts) {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, len, { ...opts, maxmem: MAXMEM }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

function isAcceptable(password) {
  return (
    typeof password === "string" && password.length >= MIN_LENGTH && password.length <= MAX_LENGTH
  );
}

async function hashPassword(password) {
  if (!isAcceptable(password)) throw new Error("пароль не подходит");
  const salt = randomBytes(16);
  const hash = await derive(password, salt, LEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

/** `stored = null` — почты нет: считаем впустую и отвечаем «нет». */
async function checkPassword(password, stored) {
  const [kind, n, r, p, salt, hash] = String(stored ?? DUMMY).split("$");
  if (kind !== "scrypt" || !hash || typeof password !== "string") return false;
  const want = Buffer.from(hash, "base64url");
  const got = await derive(
    password.slice(0, MAX_LENGTH),
    Buffer.from(salt, "base64url"),
    want.length,
    { N: Number(n), r: Number(r), p: Number(p) },
  );
  return stored != null && timingSafeEqual(want, got);
}

module.exports = { hashPassword, checkPassword, isAcceptable, MIN_LENGTH };
