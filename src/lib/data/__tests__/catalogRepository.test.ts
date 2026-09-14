import { describe, expect, it, vi } from "vitest";
import { makeProduct } from "../../__tests__/fixtures";
import type { EditorState } from "../../store/state";
import type { StorePort } from "../repository";
import { createCatalogRepository } from "../catalogRepository";

/**
 * Каталог через подменённый порт — ни стора, ни `localStorage`.
 *
 * Смысл проверок тот же, что и у остальных репозиториев: не «стор посчитал
 * правильно», а сам шов. Отдельно закреплено то, что легко потерять при
 * переезде на сервер: поиск по коду сначала смотрит штрихкод и только потом
 * артикул, а отказ в имени категории приходит успехом с `false`, а не сбоем, —
 * иначе экран показал бы «проверьте связь» там, где связь ни при чём.
 */

function fakePort(state: Partial<EditorState>): StorePort {
  return {
    get: () => state as EditorState,
    set: () => {},
  };
}

describe("createCatalogRepository", () => {
  it("отдаёт номенклатуру из порта", async () => {
    // Arrange
    const product = makeProduct();
    const repo = createCatalogRepository(fakePort({ products: [product] }));

    // Act
    const res = await repo.list();

    // Assert
    expect(res).toEqual({ ok: true, data: [product] });
  });

  it("выбрасывает товары неверной формы, но остальные отдаёт", async () => {
    // Arrange: одна битая строка в хранилище не повод спрятать всю таблицу.
    const good = makeProduct();
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const repo = createCatalogRepository(fakePort({ products: [good, { id: "" } as never] }));

    // Act
    const res = await repo.list();

    // Assert
    expect(res).toEqual({ ok: true, data: [good] });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("передаёт создание товара и отдаёт выданный id", async () => {
    // Arrange: по id карточка переносит доп.поля нового товара.
    const addProduct = vi.fn(() => "prod-new");
    const repo = createCatalogRepository(fakePort({ addProduct }));
    const input = { sku: "УК-1", barcode: "", name: "Ящик", category: "Прочее" } as never;

    // Act
    const res = await repo.create(input);

    // Assert
    expect(addProduct).toHaveBeenCalledWith(input);
    expect(res).toEqual({ ok: true, data: "prod-new" });
  });

  it("удаляет пачкой даже одну карточку", async () => {
    // Arrange: у удаления один путь на все экраны — иначе на сервере их станет
    // два, и разойдутся они молча.
    const deleteProducts = vi.fn();
    const repo = createCatalogRepository(fakePort({ deleteProducts }));

    // Act
    const res = await repo.remove(["prod-1"]);

    // Assert
    expect(deleteProducts).toHaveBeenCalledWith(["prod-1"]);
    expect(res.ok).toBe(true);
  });

  it("превращает падение импорта в отказ, а не в исключение наружу", async () => {
    // Arrange: разобранный файл при отказе обязан остаться на экране.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const repo = createCatalogRepository(
      fakePort({
        importProducts: () => {
          throw new Error("сервер недоступен");
        },
      }),
    );

    // Act
    const res = await repo.importMany([{ sku: "УК-1" } as never]);

    // Assert
    expect(res).toEqual({ ok: false, error: "data.failed" });
    spy.mockRestore();
  });

  it("передаёт групповую смену категории и партнёра", async () => {
    // Arrange
    const setProductsCategory = vi.fn();
    const setProductsPartner = vi.fn();
    const repo = createCatalogRepository(fakePort({ setProductsCategory, setProductsPartner }));

    // Act
    await repo.setCategory(["p1", "p2"], "Одежда");
    await repo.setPartner(["p1"], undefined);

    // Assert
    expect(setProductsCategory).toHaveBeenCalledWith(["p1", "p2"], "Одежда");
    // «Без партнёра» — это `undefined`, а не пропущенный аргумент: партнёра
    // снимают так же часто, как назначают.
    expect(setProductsPartner).toHaveBeenCalledWith(["p1"], undefined);
  });

  it("пишет значения доп.полей пачкой, по одному вызову на поле", async () => {
    // Arrange: карточка отдаёт все поля разом при сохранении.
    const setFieldValue = vi.fn();
    const repo = createCatalogRepository(fakePort({ setFieldValue }));

    // Act
    const res = await repo.setFields("prod-1", { fld1: "M", fld2: "" });

    // Assert
    expect(setFieldValue).toHaveBeenCalledWith("prod-1", "fld1", "M");
    // Пустое значение не пропускаем: именно оно стирает поле у товара.
    expect(setFieldValue).toHaveBeenCalledWith("prod-1", "fld2", "");
    expect(res.ok).toBe(true);
  });

  it("занятое имя категории — успех с `false`, а не отказ", async () => {
    // Arrange: связь тут ни при чём, и «проверьте связь» соврало бы человеку.
    const repo = createCatalogRepository(fakePort({ addCategory: () => false }));

    // Act
    const res = await repo.addCategory("Одежда");

    // Assert
    expect(res).toEqual({ ok: true, data: false });
  });

  it("передаёт переименование категории обоими именами", async () => {
    // Arrange: старое имя — ключ связи с товарами и полями, его нельзя терять.
    const renameCategory = vi.fn(() => true);
    const repo = createCatalogRepository(fakePort({ renameCategory }));

    // Act
    const res = await repo.renameCategory("Прочее", "Разное");

    // Assert
    expect(renameCategory).toHaveBeenCalledWith("Прочее", "Разное");
    expect(res).toEqual({ ok: true, data: true });
  });

  it("отдаёт разбор доп.поля целиком, вместе с подстановками в текст ошибки", async () => {
    // Arrange: «Поле «Размер» в этой категории уже есть» — имя в сообщении
    // приходит из стора и должно доехать до формы без потерь.
    const outcome = {
      ok: false,
      errorKey: "fields.err.dup" as const,
      errorVars: { name: "Размер" },
    };
    const repo = createCatalogRepository(fakePort({ addCategoryField: () => outcome }));

    // Act
    const res = await repo.addField("Одежда", "Размер", "select", ["S", "M"]);

    // Assert
    expect(res).toEqual({ ok: true, data: outcome });
  });

  it("ищет сначала по штрихкоду и только потом по артикулу", async () => {
    // Arrange: сканер отдаёт штрихкод, а артикул продавец задаёт как угодно —
    // вплоть до совпадения с чужим штрихкодом.
    const byBarcode = makeProduct({ barcode: "4600000000777", sku: "УК-1" });
    const bySku = makeProduct({ barcode: "4600000000888", sku: "4600000000777" });
    const repo = createCatalogRepository(fakePort({ products: [bySku, byBarcode] }));

    // Act
    const res = await repo.findByCode(" 4600000000777 ");

    // Assert
    expect(res).toEqual({ ok: true, data: byBarcode });
  });

  it("на пустом коде отвечает успехом с null, не читая номенклатуру", async () => {
    // Arrange: пустой скан — не запрос, и дёргать за ним сервер незачем.
    const products = vi.fn(() => {
      throw new Error("список читать не должны");
    });
    const repo = createCatalogRepository({
      get: () =>
        ({
          get products() {
            return products();
          },
        }) as never,
      set: () => {},
    });

    // Act
    const res = await repo.findByCode("   ");

    // Assert
    expect(res).toEqual({ ok: true, data: null });
    expect(products).not.toHaveBeenCalled();
  });
});
