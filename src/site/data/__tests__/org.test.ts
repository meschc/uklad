import { describe, expect, test } from "vitest";
import { ORG } from "../org";

/**
 * Реквизиты владельца сайта — тот редкий случай, когда проверять нужно не
 * «работает ли код», а «не врёт ли страница».
 *
 * Пока реквизиты учебные (`filled === false`), они обязаны быть заведомо
 * негодными: не «случайными», а нарушающими правило выдачи. Случайные цифры
 * ровно тем и плохи, что с заметной вероятностью оказываются чьим-то настоящим
 * ИНН, и правовая страница начинает врать о живой компании.
 *
 * Когда реквизиты подставят настоящие и поднимут флаг, тест переворачивается и
 * требует обратного — сходящихся контрольных разрядов. Так одна и та же
 * проверка ловит и «забыли заменить», и «заменили с опечаткой».
 */

/** Контрольный разряд десятизначного ИНН (приказ ФНС, веса фиксированы). */
const INN_WEIGHTS = [2, 4, 10, 3, 5, 9, 4, 6, 8];

function innCheckDigit(inn: string): number {
  const sum = INN_WEIGHTS.reduce((acc, w, i) => acc + w * Number(inn[i]), 0);
  return (sum % 11) % 10;
}

/** Контрольный разряд ОГРН: младшая цифра остатка от деления первых 12 на 11. */
function ogrnCheckDigit(ogrn: string): number {
  return Number((BigInt(ogrn.slice(0, 12)) % 11n) % 10n);
}

describe("Реквизиты владельца сайта", () => {
  test("ИНН состоит из десяти цифр, ОГРН — из тринадцати, КПП — из девяти", () => {
    expect(ORG.inn).toMatch(/^\d{10}$/);
    expect(ORG.ogrn).toMatch(/^\d{13}$/);
    expect(ORG.kpp).toMatch(/^\d{9}$/);
  });

  test("контактные адреса заполнены и различаются", () => {
    // Отдельный ящик для обращений по персональным данным требует ст. 14 152-ФЗ.
    expect(ORG.email).toMatch(/^[^@\s]+@[^@\s]+$/);
    expect(ORG.privacyEmail).toMatch(/^[^@\s]+@[^@\s]+$/);
    expect(ORG.privacyEmail).not.toBe(ORG.email);
  });

  describe.runIf(!ORG.filled)("пока они учебные", () => {
    test("код региона в ИНН и КПП не существует", () => {
      // Первые две цифры ИНН и КПП — код субъекта РФ. Кода 00 нет.
      expect(ORG.inn.slice(0, 2)).toBe("00");
      expect(ORG.kpp.slice(0, 2)).toBe("00");
    });

    test("контрольный разряд ИНН не сходится", () => {
      expect(Number(ORG.inn[9])).not.toBe(innCheckDigit(ORG.inn));
    });

    test("признак отнесения в ОГРН юридическому лицу не выдают", () => {
      // Первая цифра ОГРН: 1, 2 или 5 у юрлица. Ноль не выдают никогда.
      expect(ORG.ogrn[0]).toBe("0");
    });

    test("контрольный разряд ОГРН не сходится", () => {
      expect(Number(ORG.ogrn[12])).not.toBe(ogrnCheckDigit(ORG.ogrn));
    });

    test("почтовый индекс начинается с недопустимой цифры", () => {
      // Индексы России начинаются с 1–6.
      const index = ORG.address.match(/^\d{6}/)?.[0];
      expect(index).toBeDefined();
      expect(Number(index![0])).toBeLessThan(1);
    });

    test("код телефона в плане нумерации не выделен", () => {
      // ABC-коды начинаются с 3, 4, 8; DEF-коды — с 9. Коды 2xx свободны.
      const code = ORG.phone.match(/\((\d{3})\)/)?.[1];
      expect(code).toBeDefined();
      expect(["3", "4", "8", "9"]).not.toContain(code![0]);
    });

    test("домен лежит в зоне, которую нельзя зарегистрировать", () => {
      // .example зарезервирована RFC 2606 за примерами документации.
      expect(ORG.site).toMatch(/\.example$/);
      expect(ORG.email).toMatch(/\.example$/);
    });
  });

  describe.runIf(ORG.filled)("когда подставлены настоящие", () => {
    test("контрольный разряд ИНН сходится", () => {
      expect(Number(ORG.inn[9])).toBe(innCheckDigit(ORG.inn));
    });

    test("контрольный разряд ОГРН сходится", () => {
      expect(Number(ORG.ogrn[12])).toBe(ogrnCheckDigit(ORG.ogrn));
    });

    test("признак отнесения в ОГРН — юридическое лицо", () => {
      expect(["1", "2", "5"]).toContain(ORG.ogrn[0]);
    });

    test("от заглушечного домена не осталось следов", () => {
      expect(ORG.site).not.toMatch(/\.example$/);
      expect(ORG.email).not.toMatch(/\.example$/);
      expect(ORG.privacyEmail).not.toMatch(/\.example$/);
    });
  });
});
