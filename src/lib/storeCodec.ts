import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";

/**
 * Сохранение кабинета в браузере — сжатым (потолок данных, шаг 3, решение
 * 7 ноября: сначала дешёвый способ). Хранилище сайта — около 5 МБ, а работа
 * склада на 300 заказов в день набирает столько за две недели; сжатая она
 * занимает в 5–10 раз меньше. Сжатие — deflate (`fflate`, быстро: 5 МБ около
 * десятой доли секунды), байты уложены по 15 бит в символ, без половинок
 * суррогатных пар: такая строка хранится в `localStorage` без искажений.
 *
 * Старое сохранение (обычный JSON) читается как было и сжимается при
 * следующей записи.
 */

const HEAD = "UKZ1|";
const BASE = 0x20;

/** Текст → сжатая строка для хранилища. */
export function packText(text: string): string {
  const bytes = deflateSync(strToU8(text), { level: 1 });
  const out: string[] = [];
  const chunk: number[] = [];
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < bytes.length; i++) {
    acc = (acc << 8) | bytes[i];
    bits += 8;
    if (bits >= 15) {
      bits -= 15;
      chunk.push(((acc >> bits) & 0x7fff) + BASE);
      acc &= (1 << bits) - 1;
      if (chunk.length === 8192) {
        out.push(String.fromCharCode(...chunk));
        chunk.length = 0;
      }
    }
  }
  if (bits > 0) chunk.push(((acc << (15 - bits)) & 0x7fff) + BASE);
  out.push(String.fromCharCode(...chunk));
  return `${HEAD}${bytes.length}|${out.join("")}`;
}

/** Строка из хранилища → текст. Не сжатая — как есть; битая — `null`. */
export function unpackText(raw: string | null): string | null {
  if (raw == null || !raw.startsWith(HEAD)) return raw;
  try {
    const bar = raw.indexOf("|", HEAD.length);
    const size = Number(raw.slice(HEAD.length, bar));
    if (!Number.isInteger(size) || size < 0) return null;
    const bytes = new Uint8Array(size);
    let acc = 0;
    let bits = 0;
    let n = 0;
    for (let i = bar + 1; i < raw.length && n < size; i++) {
      acc = (acc << 15) | (raw.charCodeAt(i) - BASE);
      bits += 15;
      while (bits >= 8 && n < size) {
        bits -= 8;
        bytes[n++] = (acc >> bits) & 0xff;
      }
      acc &= (1 << bits) - 1;
    }
    if (n < size) return null;
    return strFromU8(inflateSync(bytes));
  } catch (err) {
    console.warn("[uklad] сохранение кабинета не читается", err);
    return null;
  }
}
