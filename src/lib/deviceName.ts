import type { MsgKey } from "./i18n";

/**
 * Имя устройства склада (Кирилл 22.11): по нему столы различают в списке, в
 * журнале и на экране входа, поэтому «а», «1234567» или «#$%» не годятся.
 * Правило — что в имени есть слово, а не что оно красивое: буквы любого
 * алфавита, цифры, пробел, запятая и дефис; хотя бы две буквы; цифр не больше
 * четырёх («Упаковка 2», «ТСД 1001» — да; номер телефона — нет).
 */
const ALLOWED = /^[\p{L}\d ,-]+$/u;
const MAX_DIGITS = 4;

export function deviceNameError(raw: string): MsgKey | null {
  const name = raw.trim();
  if (!name) return "ws.device.nameEmpty";
  if (!ALLOWED.test(name)) return "ws.device.nameChars";
  if ((name.match(/\p{L}/gu) ?? []).length < 2) return "ws.device.nameShort";
  if ((name.match(/\d/g) ?? []).length > MAX_DIGITS) return "ws.device.nameDigits";
  return null;
}
