import { describe, expect, test } from "vitest";
import { MAX_IMPORT_ROWS, decodeImportText, textToMatrix } from "../importSheet";
import {
  buildRows,
  findHeaderRow,
  guessColumns,
  importPlan,
  type ImportContext,
} from "../importProducts";

/**
 * Импорт товаров: что если файл пустой, огромный, в чужой кодировке, с
 * шапкой отчёта сверху, с повторами, без габаритов и с чужими колонками.
 */
const HEAD = "Артикул;Штрихкод;Название;Категория;Ширина;Высота;Глубина";
const line = (sku: string, ean = "", cat = "Одежда", dims = "10;10;10") =>
  `${sku};${ean};Товар ${sku};${cat};${dims}`;
const csv = (...rows: string[]) => [HEAD, ...rows].join("\n");
const ctx = (over: Partial<ImportContext> = {}): ImportContext => ({
  products: [],
  categories: ["Одежда", "Электроника"],
  mode: "skip",
  ...over,
});

/** Текст → строки так же, как панель: заголовок и колонки угаданы. */
function parse(text: string, c: ImportContext = ctx()) {
  const m = textToMatrix(text);
  if (!m.ok) return m;
  const h = findHeaderRow(m.matrix);
  return buildRows(m.matrix, h, guessColumns(m.matrix[h]), c);
}

describe("импорт товаров: что если", () => {
  test("пустой файл и файл только с заголовком", () => {
    expect(textToMatrix("")).toMatchObject({ ok: false, kind: "empty" });
    expect(textToMatrix(HEAD)).toMatchObject({ ok: false, kind: "format" });
  });

  test("файл больше предела строк отклоняется целиком, а не вешает предпросмотр", () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => line(`A${i}`));
    expect(parse(csv(...rows))).toMatchObject({ ok: false, reasonKey: "import.msg.tooMany" });
    const edge = Array.from({ length: MAX_IMPORT_ROWS }, (_, i) => line(`A${i}`));
    const res = parse(csv(...edge));
    expect(res.ok && res.counts.create).toBe(MAX_IMPORT_ROWS);
  });

  test("windows-1251 из 1С читается, а не превращается в «����»", () => {
    const bytes = Uint8Array.from([0xc0, 0xf0, 0xf2, 0xe8, 0xea, 0xf3, 0xeb]); // «Артикул»
    expect(decodeImportText(bytes.buffer)).toBe("Артикул");
    const utf8 = new TextEncoder().encode("Артикул").buffer;
    expect(decodeImportText(utf8 as ArrayBuffer)).toBe("Артикул");
  });

  test("шапка отчёта 1С над заголовком: заголовок найден, номера строк — как в Excel", () => {
    const res = parse(["Остатки товаров на 01.12", "", csv(line("A1"))].join("\n"));
    expect(res.ok && res.rows[0]).toMatchObject({ sku: "A1", line: 3, action: "create" });
  });

  test("обязательны только артикул и название: без категории и габаритов — «не измерен»", () => {
    const res = parse("Артикул;Наименование\nA1;Куртка");
    expect(res.ok && res.rows[0]).toMatchObject({ action: "create", category: "" });
    expect(res.ok && res.rows[0].widthCm).toBeUndefined();
    const plan = importPlan(res.ok ? res.rows : []);
    expect(plan.create[0]).not.toHaveProperty("widthCm");
    expect(parse("Название;Цена\nКуртка;5")).toMatchObject({
      ok: false,
      kind: "columns",
      missing: ["sku"],
    });
  });

  test("один-два габарита из трёх, ноль и мусор — ошибка строки, а не молча", () => {
    const res = parse(
      csv(
        line("A1", "", "Одежда", "10;;"),
        line("A2", "", "Одежда", "0;1;1"),
        line("A3", "", "", "x;1;1"),
      ),
    );
    expect(res.ok && res.rows.map((r) => r.errors[0]?.key)).toEqual([
      "import.row.partialDims",
      "import.row.badWidth",
      "import.row.badWidth",
    ]);
  });

  test("категория: регистр не важен, новой из файла заводится одна", () => {
    const res = parse(
      csv(line("A1", "", "одежда"), line("A2", "", "Посуда"), line("A3", "", "посуда")),
    );
    if (!res.ok) throw new Error("ожидали строки");
    expect(res.rows.map((r) => [r.category, r.newCategory])).toEqual([
      ["Одежда", false],
      ["Посуда", true],
      ["посуда", true],
    ]);
    expect(importPlan(res.rows).categories).toEqual(["Посуда"]);
  });

  test("дубли артикула и штрихкода — в файле и против склада", () => {
    const res = parse(
      csv(
        line("A1", "4600051070012"),
        line("A1", "4600051070029"), // тот же артикул
        line("A2", "4600 0510 70012"), // тот же код с пробелами
        line("A3", "4600051070036"),
        line("A4", "4600051070043"), // код уже у другого товара склада
      ),
      ctx({ products: [{ id: "p9", sku: "Z9", barcode: "4600051070043" }] }),
    );
    if (!res.ok) throw new Error("ожидали строки");
    expect(res.rows.map((r) => r.action)).toEqual(["create", "error", "error", "create", "error"]);
    expect(res.rows[1].errors[0].key).toBe("import.row.dupInFile");
    expect(res.rows[2].errors[0].key).toBe("import.row.dupBarcode");
    expect(res.rows[4].errors[0].key).toBe("import.row.dupBarcode");
  });

  test("повторная загрузка того же файла: «пропустить» не заводит ничего", () => {
    const file = csv(line("A1", "4600051070012"), line("A2"));
    const products = [
      { id: "p1", sku: "A1", barcode: "4600051070012" },
      { id: "p2", sku: "A2", barcode: "" },
    ];
    const again = parse(file, ctx({ products }));
    expect(again.ok && again.counts).toEqual({ create: 0, update: 0, skip: 2, error: 0 });
  });

  test("«обновить»: пустая ячейка ничего не стирает, продавец ставится всем", () => {
    const products = [{ id: "p1", sku: "A1", barcode: "111" }];
    const res = parse(
      "Артикул;Название;Вес\nA1;;2,5\nA2;Новый;",
      ctx({ products, mode: "update" }),
    );
    if (!res.ok) throw new Error("ожидали строки");
    expect(res.rows.map((r) => r.action)).toEqual(["update", "create"]);
    const plan = importPlan(res.rows, "partner-1");
    expect(plan.update).toEqual([{ id: "p1", patch: { weightKg: 2.5, partnerId: "partner-1" } }]);
    expect(plan.create[0]).toMatchObject({ sku: "A2", name: "Новый", partnerId: "partner-1" });
  });

  test("колонки: «Артикул» важнее «Кода», единицы в заголовке не мешают", () => {
    expect(
      guessColumns(["Код", "Артикул", "Наименование", "Ширина (см)", "Вес, кг", "Цвет"]),
    ).toEqual([null, "sku", "name", "widthCm", "weightKg", null]);
  });

  test("колонку назначили руками — грузится она, чужие колонки не мешают", () => {
    const m = textToMatrix("id;title;price\n1;Куртка;5");
    if (!m.ok) throw new Error("ожидали матрицу");
    expect(buildRows(m.matrix, 0, guessColumns(m.matrix[0]), ctx())).toMatchObject({
      ok: false,
      kind: "columns",
    });
    const res = buildRows(m.matrix, 0, ["sku", "name", null], ctx());
    expect(res.ok && res.rows[0]).toMatchObject({ sku: "1", name: "Куртка", action: "create" });
  });

  describe("начальные остатки", () => {
    const stock = (onHand: [string, number][] = []): ImportContext["stock"] => ({
      cell: (text) =>
        text
          .trim()
          .split(/[\s.\-/]+/)
          .join("-") === "1-1-1-1"
          ? { addr: { floorId: "f", moduleId: "m", shelfIndex: 0, cellIndex: 0 }, text: "1-1-1-1" }
          : null,
      onHand: new Map(onHand),
    });
    const file = (...rows: string[]) => ["Артикул;Название;Количество;Ячейка", ...rows].join("\n");

    test("количество «10 шт» и ячейка «1 1 1 1» — понятны; «-5», «2,5» и чужая ячейка — нет", () => {
      const res = parse(
        file(
          "A1;x;10 шт;1 1 1 1",
          "A2;x;3;",
          "A3;x;-5;",
          "A4;x;2,5;",
          "A5;x;1;9-9-9-9",
          "A6;x;;1-1-1-1",
          "A7;x;0;",
        ),
        ctx({ stock: stock() }),
      );
      if (!res.ok) throw new Error("ожидали строки");
      expect(
        res.rows.map((r) => [r.qty ?? null, r.cellText ?? null, r.errors[0]?.key ?? null]),
      ).toEqual([
        [10, "1-1-1-1", null],
        [3, null, null],
        [null, null, "import.row.badQty"],
        [null, null, "import.row.badQty"],
        [null, null, "import.row.badCell"],
        [null, null, "import.row.cellNoQty"],
        [null, null, null],
      ]);
      expect(res.units).toBe(13);
    });

    test("повтор файла не удваивает: у товара уже есть остаток — ошибка строки", () => {
      const products = [{ id: "p1", sku: "A1", barcode: "" }];
      const res = parse(file("A1;x;5;"), ctx({ products, stock: stock([["p1", 5]]) }));
      expect(res.ok && res.rows[0].errors[0]?.key).toBe("import.row.hasStock");
    });

    test("остаток к уже заведённому товару без остатка — в план, карточка пропущена", () => {
      const products = [{ id: "p1", sku: "A1", barcode: "" }];
      const res = parse(file("A1;x;5;1-1-1-1"), ctx({ products, stock: stock() }));
      if (!res.ok) throw new Error("ожидали строки");
      expect(res.rows[0].action).toBe("skip");
      const plan = importPlan(res.rows);
      expect(plan.create).toEqual([]);
      expect(plan.opening).toEqual([{ sku: "A1", qty: 5, cell: res.rows[0].cell }]);
    });

    test("без права на остатки колонки количества и ячейки не читаются вовсе", () => {
      const res = parse(file("A1;x;-5;где-то"));
      expect(res.ok && res.rows[0]).toMatchObject({ action: "create", errors: [] });
      expect(importPlan(res.ok ? res.rows : []).opening).toEqual([]);
    });
  });
});
