/**
 * Пароль владельца — scrypt с солью. Хранится строкой
 * `scrypt$N$r$p$соль$хэш`, чтобы параметры можно было поднять позже, не
 * ломая уже записанный пароль.
 */
/* global require, module, Buffer */
/* eslint-disable @typescript-eslint/no-require-imports */
const { scryptSync, randomBytes, timingSafeEqual } = require("node:crypto");

const N = 2 ** 15;
const R = 8;
const P = 1;
const LEN = 32;
// scrypt с N=2^15 просит 32 МБ — поднимаем предел Node (по умолчанию 32 МБ ровно).
const MAXMEM = 64 * 1024 * 1024;

/** Короче 12 символов не принимаем: перед админкой стоит только он и код. */
const MIN_LENGTH = 12;

function hashPassword(password) {
  if (typeof password !== "string" || password.length < MIN_LENGTH) {
    throw new Error(`пароль короче ${MIN_LENGTH} символов`);
  }
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, LEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

function checkPassword(password, stored) {
  if (typeof password !== "string" || typeof stored !== "string") return false;
  const [kind, n, r, p, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !hash) return false;
  const want = Buffer.from(hash, "base64url");
  const got = scryptSync(password.slice(0, 1024), Buffer.from(salt, "base64url"), want.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: MAXMEM,
  });
  return timingSafeEqual(want, got);
}

module.exports = { hashPassword, checkPassword, MIN_LENGTH };
