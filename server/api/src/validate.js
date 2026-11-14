/**
 * Проверка почты на сервере — те же правила, что в кабинете
 * (`src/lib/validate.ts`), общие примеры — `src/lib/__tests__/validate.cases.json`.
 * Браузеру не верим: регистрация и приглашение без этой проверки отправили
 * бы письмо на «gmail.com32r23sfddsfsaфыавфыа».
 *
 * Вход и сброс пароля проверяют почту мягко (`looksLikeEmail`): строгая
 * проверка не должна запереть тех, кто завёлся по старым правилам.
 */
/* global module */
const LATIN_TLD = /^[a-z]{2,24}$/;
const CYR_TLD = /^[а-яё]{2,12}$/;
const PUNY_TLD = /^xn--[a-z0-9]{2,59}$/;
const LOCAL = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const LABEL = /^(?!-)[a-z0-9а-яё-]{1,63}(?<!-)$/;

function isEmail(raw) {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!v || v.length > 254) return false;
  const at = v.indexOf("@");
  if (at < 1 || at !== v.lastIndexOf("@")) return false;
  const local = v.slice(0, at);
  const domain = v.slice(at + 1);
  if (local.length > 64 || !LOCAL.test(local)) return false;
  const labels = domain.split(".");
  if (labels.length < 2 || labels.some((l) => !LABEL.test(l))) return false;
  const tld = labels[labels.length - 1];
  if (!LATIN_TLD.test(tld) && !CYR_TLD.test(tld) && !PUNY_TLD.test(tld)) return false;
  if (/[а-яё]/.test(domain) && !CYR_TLD.test(tld)) return false;
  return true;
}

const looksLikeEmail = (v) => /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(String(v ?? ""));

module.exports = { isEmail, looksLikeEmail };
