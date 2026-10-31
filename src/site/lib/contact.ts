import { formatPhone } from "@/lib/phone";
import { c } from "./copy";

/**
 * Поле «Телефон или почта» в формах витрины (Кирилл 26 окт: «почему нет
 * проверки данных» — форма принимала «799423щшоуаыфа»).
 *
 * Правило одно на все формы: либо российский телефон — десять цифр после +7
 * или 8, — либо почта вида имя@домен.зона. Остальное — ошибка с подсказкой
 * под полем. Иностранные номера на первом контакте не ждём: склад и селлер у
 * нас в России, а неверный номер стоит заявки целиком — перезвонить некуда.
 */

export const CONTACT_ERROR = c(
  "Нужен телефон, например +7 900 123-45-67, или почта, например name@mail.ru",
  "Enter a phone number such as +7 900 123-45-67 or an email such as name@mail.ru",
);

const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[^\s@.]{2,}$/;
/** Набирают телефон: только цифры, плюс, скобки, дефисы и пробелы. */
const PHONE_CHARS = /^[\d+()\-\s]+$/;

export type ContactKind = "phone" | "email";

/** Что ввели — телефон, почту или ни то ни другое. */
export function contactKind(raw: string): ContactKind | null {
  const v = raw.trim();
  if (EMAIL.test(v)) return "email";
  if (PHONE_CHARS.test(v)) {
    const d = v.replace(/\D/g, "");
    if (d.length === 11 && (d[0] === "7" || d[0] === "8")) return "phone";
    if (d.length === 10 && d[0] === "9") return "phone";
  }
  return null;
}

/**
 * Маска по ходу ввода: похожее на телефон приводится к «+7 900 123-45-67»,
 * почта и всё остальное не трогается. Номер с девятки — без кода страны,
 * его дописываем; ведущую 8 меняем на +7.
 */
export function maskContact(raw: string): string {
  if (!PHONE_CHARS.test(raw) || !/\d/.test(raw)) return raw;
  const d = raw.replace(/\D/g, "");
  if (d.length > 11) return raw;
  if (d[0] === "9" && d.length <= 10) return formatPhone(`7${d}`);
  // Ведущая 8 — тот же код страны; `formatPhone` сам меняет её только на
  // полном номере, а маска нужна с первых цифр.
  if (d[0] === "8") return formatPhone(`7${d.slice(1)}`);
  return formatPhone(raw);
}
