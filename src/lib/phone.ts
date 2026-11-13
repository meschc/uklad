/**
 * Телефон в едином виде «+7 495 123-45-67» (п.25). Маска мягкая: она
 * форматирует то, что ввели, но не запрещает нестандартный номер — на складе
 * встречаются и внутренние короткие, и иностранные.
 */

/**
 * Предел поля телефона. Российский номер в маске «+7 900 000-00-00» — 16
 * знаков, международный по E.164 — до 15 цифр; со скобками и пробелами
 * хватает 20. Длиннее телефон не бывает ни при какой записи (Кирилл 12 ноя:
 * «номер почему-то бесконечно можно вводить»).
 */
export const PHONE_MAX_LENGTH = 20;
const PHONE_MAX_DIGITS = 15;

/** Только цифры; ведущая 8 приводится к 7 — это один и тот же российский код. */
function digitsOf(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("8") && d.length >= 11) return `7${d.slice(1)}`;
  return d;
}

/** Форматирование по ходу ввода. Непохожее на российский номер — как есть. */
export function formatPhone(raw: string): string {
  const d = digitsOf(raw).slice(0, PHONE_MAX_DIGITS);
  if (!d) return "";
  // Нестандартный номер оставляем как ввели, но не длиннее предела.
  if (d.length > 11 || (d[0] !== "7" && d.length >= 11)) return keepDigits(raw.trim());
  if (d[0] !== "7") return d;

  const parts = [d.slice(1, 4), d.slice(4, 7), d.slice(7, 9), d.slice(9, 11)].filter(Boolean);
  const [code, a, b, c] = parts;
  let out = "+7";
  if (code) out += ` ${code}`;
  if (a) out += ` ${a}`;
  if (b) out += `-${b}`;
  if (c) out += `-${c}`;
  return out;
}

/** Ссылка `tel:` — только цифры и плюс. */
export function telHref(raw: string): string {
  const d = digitsOf(raw);
  return d ? `tel:+${d}` : "";
}

/** Срезать лишние цифры сверх предела, не трогая скобки и пробелы. */
function keepDigits(raw: string): string {
  let n = 0;
  let out = "";
  for (const ch of raw) {
    if (/\d/.test(ch)) {
      if (n >= PHONE_MAX_DIGITS) break;
      n++;
    }
    out += ch;
  }
  return out.slice(0, PHONE_MAX_LENGTH);
}
