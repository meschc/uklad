import { useMemo } from "react";
import { useEditor } from "../store";
import { ALT_KEY, DEL_KEY, IS_MAC, MOD_KEY, SHIFT_KEY } from "../platform";
import type { Lang } from "../types";
import * as common from "./common";
import * as editor from "./editor";
import * as goods from "./goods";
import * as warehouse from "./warehouse";
import * as fulfillment from "./fulfillment";
import * as orders from "./orders";
import * as documents from "./documents";

/**
 * Мини-i18n без внешних зависимостей (ТЗ, разд. 3.3 — язык системы).
 * Плоский словарь ключ→строка на каждый язык, интерполяция `{var}`,
 * согласование числа через `plural`. Хук `useT` читает язык из профиля.
 *
 * Сам словарь разложен по доменам (`./common`, `./editor`, `./goods`,
 * `./warehouse`, `./fulfillment`, `./orders`, `./documents`) и собирается
 * внизу этого файла. Публичный API импортируется как `@/lib/i18n` — то есть
 * ровно так же, как до разрезания.
 */

type Vars = Record<string, string | number>;

/**
 * Ключ словаря. Выведен из русского словаря — он источник правды, английский
 * ниже обязан повторять его состав, и это тоже проверяет компилятор.
 *
 * До этого ключ был просто `string`, и опечатка в нём молча выводила на экран
 * сам ключ: `wh.storageRat` вместо «Ставка хранения». Такое не ловится ни
 * тестами, ни сборкой — только глазами и только на том языке, который человек
 * включил. Теперь то же самое — ошибка компиляции.
 *
 * Ключи, собираемые из данных (`module.${type}.title`, `cat.${category}`),
 * от этого не пострадали: перечисление в шаблоне разворачивается в тот же
 * union, а таблицы вроде списка интеграций объявляют своё поле как `MsgKey` и
 * проверяются вместе со словарём.
 */
export type MsgKey = keyof typeof ru;

/** Функция перевода с прикреплённым языком и помощником множественного числа. */
export type TFunc = ((key: MsgKey, vars?: Vars) => string) & {
  lang: Lang;
  plural: (n: number, ru: [string, string, string], en: [string, string]) => string;
};

/** Согласование числа: русский — 3 формы, английский — 2. */
export function plural(
  lang: Lang,
  n: number,
  ru: [string, string, string],
  en: [string, string],
): string {
  if (lang === "en") return n === 1 ? en[0] : en[1];
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return ru[0];
  if (d >= 2 && d <= 4 && (dd < 10 || dd >= 20)) return ru[1];
  return ru[2];
}

/**
 * Подписи клавиш подставляются автоматически, без параметров на месте вызова:
 * `{mod}C` → «⌘C» на macOS и «Ctrl+C» на остальных. Модификаторы включают
 * разделитель, потому что на маке его не ставят, а на Windows/Linux — ставят.
 */
const PLATFORM_VARS: Record<string, string> = {
  mod: IS_MAC ? MOD_KEY : `${MOD_KEY}+`,
  alt: IS_MAC ? ALT_KEY : `${ALT_KEY}+`,
  shift: IS_MAC ? SHIFT_KEY : `${SHIFT_KEY}+`,
  del: DEL_KEY,
};

/**
 * Запрет висячих строк и предлогов. Короткое слово (предлог, союз) и число не
 * должны оставаться в конце строки — приклеиваем их к следующему слову
 * неразрывным пробелом. Балансировкой самой последней строки абзаца занимается
 * CSS (`text-wrap: pretty` в `index.css`) — одно без другого работает наполовину.
 */
const NBSP = "\u{00a0}"; // неразрывный пробел
const ORPHAN_RE = /(^|[\s(«"„])(\p{L}{1,2}|\d+)[ \t]+/gu;

function noOrphans(s: string): string {
  if (!s.includes(" ")) return s;
  // Два прохода: цепочку коротких слов («и в углу») первый проход съедает
  // вместе с разделителем, на котором должен был сработать второй.
  return s.replace(ORPHAN_RE, `$1$2${NBSP}`).replace(ORPHAN_RE, `$1$2${NBSP}`);
}

export function translate(lang: Lang, key: MsgKey, vars?: Vars): string {
  const table = messages[lang] ?? messages.ru;
  // Три запасных варианта подряд выглядят лишними — по типам ключ есть в обоих
  // словарях. Оставлены сознательно: `translate` вызывают и из мест, где ключ
  // собран из данных, а данные приходят из хранилища браузера и переживают
  // переименование ключа. Пусть лучше на экране будет сам ключ, чем `undefined`.
  let s: string = table[key] ?? messages.ru[key] ?? key;
  if (vars) {
    for (const k of Object.keys(vars)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(vars[k]));
    }
  }
  if (s.includes("{")) {
    s = s.replace(/\{(mod|alt|del|shift)\}/g, (_, k: string) => PLATFORM_VARS[k]);
  }
  return noOrphans(s);
}

/**
 * Сборка `t` вынесена из хука намеренно. `t` — функция с приписанными
 * свойствами (`t.lang`, `t.plural`), а дописывать поля к функции внутри хука
 * React считает изменением неизменяемого: компилятор вправе такую функцию
 * запомнить и переиспользовать, и приписки к ней потерялись бы. Здесь же это
 * обычная фабрика: объект собирается целиком и наружу уходит готовым.
 */
function makeT(lang: Lang): TFunc {
  const t = ((key: MsgKey, vars?: Vars) => translate(lang, key, vars)) as TFunc;
  t.lang = lang;
  t.plural = (n, ru, en) => plural(lang, n, ru, en);
  return t;
}

/** Хук перевода: `const t = useT(); t("key")`, `t.lang`, `t.plural(...)`. */
export function useT(): TFunc {
  const lang = useEditor((s) => s.profile.language);
  return useMemo(() => makeT(lang), [lang]);
}

/**
 * Перевод по ключу, которого может не быть, — с запасной подписью.
 *
 * Обычный `t` требует ключ из словаря, и это правильно: почти всякий ключ в
 * приложении известен заранее. Но есть два места, где половину ключа вводит
 * сам пользователь: своя категория товара (`cat.<имя>`) и своё имя раскладки
 * (`tpl.seed.<имя>`). Перевода у них нет и не будет — и это не ошибка, а
 * замысел: показываем введённое имя как есть, а не сырой ключ (п.15).
 *
 *   labelOr(t, `cat.${category}`, category)
 *
 * Единственное разрешённое приведение к `MsgKey` во всём приложении живёт
 * здесь. Так проще следить: если приведение появится где-то ещё, значит там
 * либо забыли объявить поле как `MsgKey`, либо это третий случай такого же
 * рода — и тогда ему место тут же, рядом.
 *
 * Как узнаём, что ключа не было: `translate` на неизвестном ключе возвращает
 * сам ключ. Совпадение результата с ключом и есть признак.
 */
export function labelOr(t: TFunc, key: string, fallback: string): string {
  const value = t(key as MsgKey);
  return value === key ? fallback : value;
}

/**
 * Подпись категории. Стартовые категории переведены (`cat.*`), пользовательские
 * переводов не имеют — показываем их как есть, а не сырым ключом (п.15).
 */
export function catLabel(t: TFunc, category: string): string {
  return labelOr(t, `cat.${category}`, category);
}

// --- Сборка словарей ---------------------------------------------------------

// Без аннотации типа намеренно: `Record<string, string>` стёр бы имена ключей,
// а именно они и нужны — из них собран `MsgKey` выше. Порядок ключей на
// поведении не сказывается: словарь читают только по ключу.
//
// Оговорка про разрезание: в отличие от одного объектного литерала, спред
// повторный ключ не подсвечивает — второй просто перекроет первый и молча
// заберёт себе чужой перевод. Поэтому в `i18n.test.ts` есть счётчик: сумма
// ключей по частям обязана совпасть с числом ключей собранного словаря.
const ru = {
  ...common.ru,
  ...editor.ru,
  ...goods.ru,
  ...warehouse.ru,
  ...fulfillment.ru,
  ...orders.ru,
  ...documents.ru,
};

// А здесь аннотация нужна: она требует от английского словаря ровно тот же
// состав ключей. Забытый перевод и осиротевший после переименования ключ
// становятся ошибкой сборки, а не находкой человека, включившего английский.
const en: Record<MsgKey, string> = {
  ...common.en,
  ...editor.en,
  ...goods.en,
  ...warehouse.en,
  ...fulfillment.en,
  ...orders.en,
  ...documents.en,
};

export const messages: Record<Lang, Record<MsgKey, string>> = { ru, en };

/**
 * Части словаря — для теста, который считает ключи. Приложению они не нужны:
 * оно ходит через `t`, `translate` и `messages`.
 */
export const dictionaryParts = [
  common,
  editor,
  goods,
  warehouse,
  fulfillment,
  orders,
  documents,
] as const;
