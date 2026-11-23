import { describe, expect, test } from "vitest";
import {
  MAX_IMPORT_ROWS,
  decodeImportText,
  parseImportText,
  rowsToProducts,
} from "../importProducts";

/**
 * Импорт товаров: что если файл пустой, огромный, в чужой кодировке, с
 * повторами и чужими колонками.
 */
const HEAD = "Артикул;Штрихкод;Название;Категория;Ширина;Высота;Глубина";
const line = (sku: string, ean = "", cat = "Одежда") =>
  `${sku};${ean};Товар ${sku};${cat};10;10;10`;
const csv = (...rows: string[]) => [HEAD, ...rows].join("\n");
const none = new Set<string>();

describe("импорт товаров: что если", () => {
  test("пустой файл и файл только с заголовком", () => {
    expect(parseImportText("", none)).toMatchObject({ ok: false, kind: "empty" });
    expect(parseImportText(HEAD, none)).toMatchObject({ ok: false, kind: "format" });
  });

  test("файл больше предела строк отклоняется целиком, а не вешает предпросмотр", () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => line(`A${i}`));
    expect(parseImportText(csv(...rows), none)).toMatchObject({
      ok: false,
      reasonKey: "import.msg.tooMany",
    });
    const edge = Array.from({ length: MAX_IMPORT_ROWS }, (_, i) => line(`A${i}`));
    const res = parseImportText(csv(...edge), none);
    expect(res.ok && res.validCount).toBe(MAX_IMPORT_ROWS);
  });

  test("windows-1251 из 1С читается, а не превращается в «����»", () => {
    const bytes = Uint8Array.from([0xc0, 0xf0, 0xf2, 0xe8, 0xea, 0xf3, 0xeb]); // «Артикул»
    expect(decodeImportText(bytes.buffer)).toBe("Артикул");
    const utf8 = new TextEncoder().encode("Артикул").buffer;
    expect(decodeImportText(utf8 as ArrayBuffer)).toBe("Артикул");
  });

  test("дубли артикула и штрихкода — в файле и против склада", () => {
    const res = parseImportText(
      csv(
        line("A1", "4600051070012"),
        line("A1", "4600051070029"), // тот же артикул
        line("A2", "4600 0510 70012"), // тот же код с пробелами
        line("A3", "4600051070036"),
        line("A4", "4600051070043"), // код уже на складе
      ),
      new Set(),
      new Set(["4600051070043"]),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.rows.map((r) => r.ok)).toEqual([true, false, false, true, false]);
    expect(res.rows[1].errors[0].key).toBe("import.row.dupSku");
    expect(res.rows[2].errors[0].key).toBe("import.row.dupBarcode");
    expect(res.rows[4].errors[0].key).toBe("import.row.dupBarcode");
  });

  test("повторная загрузка того же файла: всё — дубли, годных нет", () => {
    const file = csv(line("A1", "4600051070012"), line("A2", "4600051070029"));
    const again = parseImportText(file, new Set(["A1", "A2"]), new Set(["4600051070012"]));
    expect(again.ok && again.validCount).toBe(0);
  });

  test("чужие колонки пропускаются и названы, обязательных нет — отказ со списком найденных", () => {
    const res = parseImportText(
      "Артикул;Название;Категория;Ширина;Высота;Глубина;Цвет;Поставщик\nA1;Куртка;Одежда;1;1;1;красный;Х",
      none,
    );
    expect(res.ok && res.ignored).toEqual(["Цвет", "Поставщик"]);
    const foreign = parseImportText("id;title;price\n1;x;5", none);
    expect(foreign).toMatchObject({ ok: false, kind: "columns" });
  });

  test("в импорт идут только годные строки", () => {
    const res = parseImportText(csv(line("A1"), line("A2", "", "Нет такой")), none);
    expect(res.ok && rowsToProducts(res.rows).map((p) => p.sku)).toEqual(["A1"]);
  });
});
