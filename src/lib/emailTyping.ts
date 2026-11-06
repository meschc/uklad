/**
 * Помощь при наборе почты: раскладка и подсказка домена.
 *
 * Сайт не может переключить раскладку клавиатуры — это делает система. Зато
 * набранное в русской раскладке можно перевести на лету по клавишам:
 * «лшк"нфтвуч» → «kir@yandex». Шифт+2 в русской раскладке даёт кавычку —
 * это та же клавиша, что «@».
 *
 * Кириллические адреса (почта.рф) этим ломаются, но они редкость, а
 * «лшк» вместо «kir» — частая ошибка на каждом втором входе.
 */

const RU = "йцукенгшщзхъфывапролджэячсмитьбюё";
const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const KEYS = new Map<string, string>();
for (let i = 0; i < RU.length; i++) {
  KEYS.set(RU[i], EN[i]);
  KEYS.set(RU[i].toUpperCase(), EN[i].toUpperCase());
}

const CYRILLIC = /[а-яё]/i;

/**
 * Перевести набранное в русской раскладке в латиницу. Буквы переводятся,
 * только если в строке есть кириллица; кавычка — пока в адресе нет «@»:
 * буквы уже стали латиницей, а «@» человек набирает той же клавишей.
 */
export function fixEmailLayout(value: string): string {
  let out = CYRILLIC.test(value) ? Array.from(value, (ch) => KEYS.get(ch) ?? ch).join("") : value;
  if (!value.includes("@")) out = out.replace('"', "@");
  return out;
}

/** Почтовые сервисы по частоте у наших людей: сначала российские. */
export const POPULAR_DOMAINS = [
  "yandex.ru",
  "mail.ru",
  "gmail.com",
  "ya.ru",
  "bk.ru",
  "inbox.ru",
  "list.ru",
  "rambler.ru",
  "icloud.com",
  "outlook.com",
] as const;

/**
 * Подсказки домена: после «@» — сервисы, начинающиеся с набранного.
 * До «@», с пустым именем или уже с полным доменом из списка — ничего.
 */
export function suggestEmailDomains(value: string, limit = 3): string[] {
  const at = value.indexOf("@");
  if (at < 1 || value.indexOf("@", at + 1) !== -1) return [];
  const name = value.slice(0, at);
  const typed = value.slice(at + 1).toLowerCase();
  return POPULAR_DOMAINS.filter((d) => d.startsWith(typed) && d !== typed)
    .slice(0, limit)
    .map((d) => `${name}@${d}`);
}
