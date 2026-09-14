import { useMemo } from "react";
import { plural } from "./plural";
import { useLang, type SiteLang } from "./lang";

/**
 * Двуязычный текст витрины.
 *
 * В приложении словарь устроен иначе — плоский ключ→строка на каждый язык
 * (`lib/i18n`). Для интерфейса с двумя тысячами подписей это правильно: ключи
 * повторяются, и таблицы удобно сравнивать целиком. Для витрины — нет: текста
 * втрое меньше, но он длиннее и меняется чаще, и половина правок — это правки
 * копирайта, а не кода.
 *
 * Поэтому здесь пара живёт одним объектом: `c("Склады", "Warehouses")`. Отсюда
 * два следствия, ради которых всё и затевалось:
 *  - забыть перевод невозможно — этого не даст тип, а не дисциплина;
 *  - правя русскую строку, переводчик видит английскую в той же строке файла,
 *    и они не расходятся молча.
 *
 * Текст остаётся рядом с компонентом, который его показывает: отдельный
 * словарь на весь сайт означал бы, что правка одного абзаца требует прыжка
 * между двумя файлами и выдумывания имени ключа.
 */
export interface Copy {
  ru: string;
  en: string;
}

/** Сокращение для объявления пары: `c("Русский текст", "English text")`. */
export function c(ru: string, en: string): Copy {
  return { ru, en };
}

export type Vars = Record<string, string | number>;

/** Функция перевода с прикреплённым языком и согласованием числа. */
export type TFunc = ((copy: Copy, vars?: Vars) => string) & {
  lang: SiteLang;
  plural: (n: number, ru: [string, string, string], en: [string, string]) => string;
};

/** Подстановка `{name}` — для строк, в которые попадают числа и названия. */
export function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  // `split`/`join`, а не `replaceAll`: цель сборки ниже ES2021, а регулярное
  // выражение здесь пришлось бы экранировать ради ничего.
  return Object.keys(vars).reduce(
    (acc, key) => acc.split(`{${key}}`).join(String(vars[key])),
    text,
  );
}

export function pick(lang: SiteLang, copy: Copy, vars?: Vars): string {
  return fill(copy[lang] ?? copy.ru, vars);
}

/**
 * Сборка `t` вынесена из хука намеренно. `t` — функция с приписанными
 * свойствами (`t.lang`, `t.plural`), а дописывать поля к функции внутри хука
 * React считает изменением неизменяемого: компилятор вправе такую функцию
 * запомнить и переиспользовать, и приписки к ней потерялись бы. Здесь же это
 * обычная фабрика: объект собирается целиком и наружу уходит готовым.
 */
function makeT(lang: SiteLang): TFunc {
  const t = ((copy: Copy, vars?: Vars) => pick(lang, copy, vars)) as TFunc;
  t.lang = lang;
  // Английскому хватает двух форм, русскому нужно три — считать их одной
  // функцией нельзя, а выбирать на месте вызова слишком легко забыть.
  t.plural = (n, ru, en) =>
    lang === "en" ? (n === 1 ? en[0] : en[1]) : plural(n, ru[0], ru[1], ru[2]);
  return t;
}

/** Хук перевода: `const t = useT(); t(T.title)`, `t.lang`, `t.plural(...)`. */
export function useT(): TFunc {
  const lang = useLang();
  return useMemo(() => makeT(lang), [lang]);
}
