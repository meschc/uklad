import { describe, expect, it } from "vitest";
import { parseRoute } from "../route";

/**
 * Разбор адреса витрины.
 *
 * Тест здесь нужен из-за одного неочевидного различия, которое глазами не
 * видно и ломается молча. В хэше живут две разные вещи: адреса разделов
 * (`#/market`) и якоря секций лендинга (`#how`). Отличаются они ровно косой
 * чертой, а поступать с ними нужно противоположно — неизвестный раздел это
 * «страница не найдена», неизвестный якорь это лендинг, на котором секцию
 * когда-то переименовали.
 *
 * Перепутать их — значит либо отдать 404 на живую ссылку из чужой закладки,
 * либо молча показать лендинг тому, кто шёл за конкретной страницей. Второе
 * хуже: человек решит, что нужного раздела у сервиса нет вовсе.
 */
describe("parseRoute", () => {
  it("узнаёт разделы витрины", () => {
    expect(parseRoute("#/market")).toEqual({ page: "market", id: undefined });
    expect(parseRoute("#/pricing")).toEqual({ page: "pricing", id: undefined });
    expect(parseRoute("#/legal/privacy")).toEqual({ page: "legal", id: "privacy" });
  });

  it("считает лендингом пустой адрес", () => {
    expect(parseRoute("")).toEqual({ page: "landing" });
    expect(parseRoute("#")).toEqual({ page: "landing" });
    expect(parseRoute("#/")).toEqual({ page: "landing" });
  });

  it("ведёт якоря секций на лендинг", () => {
    // Такие ссылки стоят в самом лендинге («как это работает», «вопросы») и
    // расходятся по закладкам. Секцию могут переименовать — страница обязана
    // открыться в любом случае.
    expect(parseRoute("#how")).toEqual({ page: "landing" });
    expect(parseRoute("#faq")).toEqual({ page: "landing" });
    expect(parseRoute("#section-which-is-gone")).toEqual({ page: "landing" });
  });

  it("отдаёт «не найдено» на несуществующий раздел", () => {
    expect(parseRoute("#/sklad")).toEqual({ page: "notfound" });
    expect(parseRoute("#/blog/2024")).toEqual({ page: "notfound" });
  });

  it("держит старый адрес склада внутри витрины", () => {
    // Склад раньше открывался поверх каталога и жил по `#/market/w-12`.
    expect(parseRoute("#/market/w-12")).toEqual({ page: "warehouse", id: "w-12" });
  });

  it("отличает список документов от самого документа", () => {
    expect(parseRoute("#/legal")).toEqual({ page: "legal", id: undefined });
  });
});
