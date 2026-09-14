import { describe, expect, test, vi } from "vitest";

// Словари лежат в одном модуле с хуком `useT`, а тот тянет стор — со всем его
// хранилищем, которого в тестах нет. Проверяем сами словари, поэтому стор
// подменяем заглушкой: до него здесь ни одна проверка не доходит.
vi.mock("../store", () => ({ useEditor: () => "ru" }));

import { dictionaryParts, messages, plural, translate, type MsgKey } from "../i18n";

// `Object.keys` отдаёт `string[]` — то, что это ключи словаря, по дороге
// теряется. Возвращаем это знание один раз здесь: дальше проверки ходят
// такими ключами в оба словаря сразу, и без типа каждое обращение было бы
// `any` — то есть непроверенным.
const ruKeys = Object.keys(messages.ru) as MsgKey[];
const enKeys = Object.keys(messages.en) as MsgKey[];

/**
 * Двуязычие системы.
 *
 * Проверять здесь надо не качество перевода, а то, что ломается молча.
 * `translate` при отсутствии ключа отдаёт русскую строку — это правильное
 * поведение (лучше русское слово, чем `wh.storageRate` на экране), но у него
 * есть цена: забытый перевод не падает, не логируется и не виден никому, кроме
 * человека, который переключил язык на английский и наткнулся на русскую фразу
 * посреди своего интерфейса. Тест — единственное место, где это заметно.
 */
describe("Словари", () => {
  test("в словарях одни и те же ключи", () => {
    const missingEn = ruKeys.filter((k) => !(k in messages.en));
    const extraEn = enKeys.filter((k) => !(k in messages.ru));
    expect(missingEn).toEqual([]);
    // Лишний английский ключ — тоже поломка: значит, строку в русском
    // переименовали, а в английском осталась старая, и она не показывается.
    expect(extraEn).toEqual([]);
  });

  test("английский перевод не остался русским", () => {
    // Кроме названий самих языков: язык в переключателе называется на себе же,
    // иначе человек, который не читает по-английски, не найдёт «Русский».
    const cyrillic = enKeys.filter(
      (k) => k !== "profile.lang.ru" && /[А-Яа-яЁё]/.test(messages.en[k]),
    );
    expect(cyrillic).toEqual([]);
  });

  test("переменные в переводе те же, что в оригинале", () => {
    // `{n}`, `{name}`, `{mod}` подставляются по имени. Потерянная в переводе
    // переменная — это исчезнувшее с экрана число, а лишняя остаётся на экране
    // фигурными скобками.
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const broken = ruKeys.filter(
      (k) => vars(messages.ru[k]).join() !== vars(messages.en[k] ?? "").join(),
    );
    expect(broken).toEqual([]);
  });

  test("ни один ключ не потерялся при склейке частей", () => {
    // Словарь собран спредом из файлов по доменам, а спред, в отличие от одного
    // объектного литерала, повторный ключ не подсвечивает: второй молча
    // перекроет первый, и строка покажет чужой перевод — при этом обе проверки
    // выше останутся зелёными, ключи-то на месте. Ловится только счётом.
    const count = (part: Record<string, string>) => Object.keys(part).length;
    const sumRu = dictionaryParts.reduce((n, part) => n + count(part.ru), 0);
    const sumEn = dictionaryParts.reduce((n, part) => n + count(part.en), 0);
    expect(sumRu).toBe(ruKeys.length);
    expect(sumEn).toBe(enKeys.length);
  });

  test("пустых строк в словарях нет", () => {
    const empty = [...ruKeys, ...enKeys].filter(
      (k) => !messages.ru[k]?.trim() || !messages.en[k]?.trim(),
    );
    expect(empty).toEqual([]);
  });
});

describe("Согласование числа", () => {
  test("русский берёт форму по последним цифрам", () => {
    const forms: [string, string, string] = ["ячейка", "ячейки", "ячеек"];
    expect(plural("ru", 1, forms, ["cell", "cells"])).toBe("ячейка");
    expect(plural("ru", 3, forms, ["cell", "cells"])).toBe("ячейки");
    expect(plural("ru", 5, forms, ["cell", "cells"])).toBe("ячеек");
    // Одиннадцать — исключение: заканчивается на единицу, но форма как у пяти.
    expect(plural("ru", 11, forms, ["cell", "cells"])).toBe("ячеек");
    expect(plural("ru", 21, forms, ["cell", "cells"])).toBe("ячейка");
    expect(plural("ru", 112, forms, ["cell", "cells"])).toBe("ячеек");
  });

  test("английский различает только единицу", () => {
    const forms: [string, string, string] = ["ячейка", "ячейки", "ячеек"];
    expect(plural("en", 1, forms, ["cell", "cells"])).toBe("cell");
    expect(plural("en", 0, forms, ["cell", "cells"])).toBe("cells");
    expect(plural("en", 21, forms, ["cell", "cells"])).toBe("cells");
  });
});

describe("Подстановка", () => {
  test("незнакомый ключ возвращается как есть", () => {
    // Так его видно в интерфейсе и можно найти поиском по словарю.
    //
    // Приведение здесь — сама суть проверки: ключей вне словаря по типам не
    // существует, и подсунуть такой можно только силой. Проверяем то, что
    // случится, если типы всё-таки обойдут — например, ключ придёт из данных.
    expect(translate("en", "нет.такого.ключа" as MsgKey)).toBe("нет.такого.ключа");
  });

  test("переменная подставляется в обоих языках", () => {
    const key = ruKeys.find((k) => messages.ru[k].includes("{n}"));
    expect(key).toBeDefined();
    expect(translate("ru", key!, { n: 7 })).toContain("7");
    expect(translate("en", key!, { n: 7 })).toContain("7");
  });
});
