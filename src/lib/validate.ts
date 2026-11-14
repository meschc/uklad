/**
 * Проверка данных, которые человек вводит руками: почта, имя, должность,
 * телефон, реквизиты, ссылка. Одни правила на все формы (Кирилл 14 ноя:
 * «на этот адрес можно отправить письмо, это же бред, проведи глубже работу
 * по валидации данных»).
 *
 * Каждая функция возвращает `null`, если значение годится, или ключ словаря
 * с тем, что не так, — его форма показывает под полем (`ui/field`). Пустое
 * значение здесь не ошибка: обязательность решает форма.
 *
 * Те же правила для почты на сервере — `server/api/src/validate.js`, общие
 * примеры — `__tests__/validate.cases.json`.
 */
import type { MsgKey } from "./i18n";
import { isValidInn } from "./company";

export type Check = MsgKey | null;

const LATIN_TLD = /^[a-z]{2,24}$/;
const CYR_TLD = /^[а-яё]{2,12}$/;
// Зона punycode — только целиком нелатинская (xn--p1ai = рф): без дефиса
// после префикса. Иначе браузер в поле type=email превращает «com32…фыа» в
// xn--com32…-… и мусор проходит как зона.
const PUNY_TLD = /^xn--[a-z0-9]{2,59}$/;
const LOCAL = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const LABEL = /^(?!-)[a-z0-9а-яё-]{1,63}(?<!-)$/;

/**
 * Почта: латинская часть до «@», домен из меток не длиннее 63 знаков,
 * зона — только буквы одной азбуки (`ru`, `com`, `рф`) или punycode. Так
 * отсекается «gmail.com32r23sfddsfsaфыавфыа»: в зоне цифры и две азбуки.
 */
export function checkEmail(raw: string): Check {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (v.length > 254) return "valid.email";
  const at = v.lastIndexOf("@");
  if (at < 1 || at !== v.indexOf("@")) return "valid.email";
  const local = v.slice(0, at);
  const domain = v.slice(at + 1);
  if (local.length > 64 || !LOCAL.test(local)) return "valid.email";
  const labels = domain.split(".");
  if (labels.length < 2 || labels.some((l) => !LABEL.test(l))) return "valid.email";
  const tld = labels[labels.length - 1];
  if (!LATIN_TLD.test(tld) && !CYR_TLD.test(tld) && !PUNY_TLD.test(tld)) return "valid.email";
  // Кириллица в домене — только целиком кириллический домен (почта.рф).
  if (/[а-яё]/.test(domain) && !CYR_TLD.test(tld)) return "valid.email";
  return null;
}

export const isEmail = (raw: string): boolean => !!raw.trim() && checkEmail(raw) === null;

/**
 * Имя человека: буквы любой азбуки, пробел, дефис, апостроф, точка
 * (инициалы). Цифр в имени не бывает.
 */
export function checkPersonName(raw: string): Check {
  const v = raw.trim().replace(/\s+/g, " ");
  if (!v) return null;
  if (/\d/.test(v)) return "valid.nameDigits";
  if (v.length > 80 || !/^\p{L}[\p{L}\p{M} .'’-]*$/u.test(v)) return "valid.name";
  if ((v.match(/\p{L}/gu) ?? []).length < 2) return "valid.name";
  return null;
}

/**
 * Должность, название партнёра и подобные подписи: нужны буквы, допустимы
 * цифры (№ 2, 1С), но не номер-простыня — больше трёх цифр подряд значит
 * мусор («Управляющий 123123123123»).
 */
export function checkTitle(raw: string, max = 60): Check {
  const v = raw.trim();
  if (!v) return null;
  if (v.length > max) return "valid.tooLong";
  if ((v.match(/\p{L}/gu) ?? []).length < 2) return "valid.title";
  if (/\d{4,}/.test(v)) return "valid.titleDigits";
  if (!/^[\p{L}\p{M}\d .,'’"«»()&/№+:-]+$/u.test(v)) return "valid.title";
  return null;
}

/**
 * Телефон. Российский — 11 цифр с 7 (или 8) впереди и кодом на 3, 4, 8 или 9.
 * Иностранный — только с «+»: от 8 до 15 цифр (E.164). Номер без «+» и не
 * российский — опечатка («123123124123542»).
 */
export function checkPhone(raw: string): Check {
  const v = raw.trim();
  if (!v) return null;
  if (!/^[+\d\s()-]+$/.test(v)) return "valid.phone";
  let d = v.replace(/\D/g, "");
  if (d.length === 11 && d[0] === "8" && !v.startsWith("+")) d = `7${d.slice(1)}`;
  if (d[0] === "7" && d.length <= 11) {
    return d.length === 11 && "3489".includes(d[1]) ? null : "valid.phone";
  }
  if (!v.startsWith("+")) return "valid.phone";
  return d.length >= 8 && d.length <= 15 && d[0] !== "0" ? null : "valid.phone";
}

export function checkInn(raw: string): Check {
  const v = raw.trim();
  if (!v) return null;
  return /^\d+$/.test(v) && isValidInn(v) ? null : "valid.inn";
}

/** КПП: 9 знаков, пятый и шестой могут быть буквами (причина постановки). */
export function checkKpp(raw: string): Check {
  const v = raw.trim().toUpperCase();
  if (!v) return null;
  return /^\d{4}[\dA-Z]{2}\d{3}$/.test(v) ? null : "valid.kpp";
}

/**
 * ОГРН (13 цифр) и ОГРНИП (15): последняя цифра — остаток от деления
 * остальных на 11 (на 13 у ОГРНИП), взятый по модулю 10.
 */
export function checkOgrn(raw: string): Check {
  const v = raw.trim();
  if (!v) return null;
  if (!/^(\d{13}|\d{15})$/.test(v)) return "valid.ogrn";
  const body = BigInt(v.slice(0, -1));
  const mod = BigInt(v.length === 13 ? 11 : 13);
  return Number((body % mod) % 10n) === Number(v.slice(-1)) ? null : "valid.ogrn";
}

/** Ссылка: только http(s) и настоящий домен с зоной. Загруженный файл (`data:`) — не ссылка. */
export function checkUrl(raw: string): Check {
  const v = raw.trim();
  if (!v || v.startsWith("data:")) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" && u.protocol !== "http:") return "valid.url";
    const host = u.hostname.toLowerCase();
    const tld = host.split(".").pop() ?? "";
    if (!host.includes(".") || !(LATIN_TLD.test(tld) || PUNY_TLD.test(tld))) return "valid.url";
    return null;
  } catch {
    return "valid.url";
  }
}

export type PersonErrors = Partial<
  Record<"name" | "role" | "phone" | "email" | "photoUrl", MsgKey>
>;

/** Ошибки карточки человека: сотрудник, ответственное лицо. */
export function checkPerson(p: {
  name: string;
  role?: string;
  phone?: string;
  email?: string;
  photoUrl?: string;
}): PersonErrors {
  const all: PersonErrors = {
    name: checkPersonName(p.name) ?? undefined,
    role: checkTitle(p.role ?? "") ?? undefined,
    phone: checkPhone(p.phone ?? "") ?? undefined,
    email: checkEmail(p.email ?? "") ?? undefined,
    photoUrl: checkUrl(p.photoUrl ?? "") ?? undefined,
  };
  return Object.fromEntries(Object.entries(all).filter(([, v]) => v)) as PersonErrors;
}

export type PartnerErrors = Partial<Record<"name" | "contact" | "person" | "phone", MsgKey>>;

/**
 * Партнёр-продавец: название обязательно, почта — куда звать в кабинет
 * продавца (обязательна при добавлении, `needContact`), контакт — имя
 * человека, телефон.
 */
export function checkPartner(
  p: { name: string; contact: string; person: string; phone: string },
  needContact = false,
): PartnerErrors {
  const all: PartnerErrors = {
    name: p.name.trim() ? (checkTitle(p.name, 120) ?? undefined) : "valid.required",
    contact:
      needContact && !p.contact.trim() ? "valid.email" : (checkEmail(p.contact) ?? undefined),
    person: checkPersonName(p.person) ?? undefined,
    phone: checkPhone(p.phone) ?? undefined,
  };
  return Object.fromEntries(Object.entries(all).filter(([, v]) => v)) as PartnerErrors;
}
