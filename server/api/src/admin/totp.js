/**
 * Одноразовые коды из приложения (TOTP, RFC 6238): второй фактор входа в
 * админку. Секрет — 20 случайных байт в base32, как ждут Яндекс Ключ,
 * Google Authenticator и любые их аналоги.
 *
 * Код живёт 30 секунд; принимаем соседний шаг в обе стороны — часы телефона
 * редко идут секунда в секунду. Повтор уже принятого кода отбрасывает
 * вызывающий по `step`: подсмотренный код не войдёт второй раз.
 */
/* global require, module, Buffer */
/* eslint-disable @typescript-eslint/no-require-imports */
const { createHmac, randomBytes, timingSafeEqual } = require("node:crypto");

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_MS = 30_000;

function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(text) {
  const clean = text.replace(/[\s=]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error("секрет не в base32");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function newSecret() {
  return base32Encode(randomBytes(20));
}

function codeAt(secret, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const off = mac[mac.length - 1] & 15;
  const n = (mac.readUInt32BE(off) & 0x7fffffff) % 1_000_000;
  return String(n).padStart(6, "0");
}

/**
 * Проверить код. Возвращает шаг, на котором код совпал, или `null`.
 * Шаг не больше `lastStep` не принимается — это и есть защита от повтора.
 */
function verify(secret, code, nowMs, lastStep = -1) {
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) return null;
  const now = Math.floor(nowMs / STEP_MS);
  for (const step of [now - 1, now, now + 1]) {
    if (step <= lastStep) continue;
    if (timingSafeEqual(Buffer.from(codeAt(secret, step)), Buffer.from(code))) return step;
  }
  return null;
}

/** Ссылка для QR-кода в приложении: `otpauth://totp/…`. */
function otpauthUrl(secret, label, issuer = "Уклад админка") {
  const l = encodeURIComponent(`${issuer}:${label}`);
  return `otpauth://totp/${l}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&period=30&digits=6`;
}

module.exports = { newSecret, codeAt, verify, otpauthUrl, base32Encode, base32Decode, STEP_MS };
