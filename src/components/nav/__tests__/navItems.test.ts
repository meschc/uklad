import { describe, expect, it } from "vitest";
import { applyOrder, moveItem, navFor } from "../navItems";

/**
 * Порядок пунктов меню, выставленный человеком.
 *
 * Ошибка здесь тихая: после обновления продукта новый экран просто не
 * появится в меню у того, кто однажды его переставлял.
 */
describe("applyOrder", () => {
  const id = (x: string) => x;

  it("ставит записи в сохранённом порядке", () => {
    expect(applyOrder(["a", "b", "c"], ["c", "a", "b"], id)).toEqual(["c", "a", "b"]);
  });

  it("новые записи — в конец, исчезнувшие ключи пропускаются", () => {
    expect(applyOrder(["a", "b", "new"], ["gone", "b", "a"], id)).toEqual(["b", "a", "new"]);
  });

  it("без сохранённого порядка список не меняется", () => {
    expect(applyOrder(["a", "b"], undefined, id)).toEqual(["a", "b"]);
  });
});

describe("moveItem", () => {
  it("переносит вниз и вверх", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });
});

/**
 * Процессы склада — вкладки рабочего места, а не пункты меню кабинета.
 * Вернуть приёмку в меню значило бы снова держать два входа в одну работу.
 */
describe("меню склада", () => {
  const views = navFor("warehouse").map((n) => n.view);

  it("приёмки и сборки в меню нет, рабочее место и задания есть", () => {
    expect(views).not.toContain("receiving");
    expect(views).not.toContain("picking");
    expect(views).toContain("workstation");
    expect(views).toContain("tasks");
  });
});

describe("меню по правам роли (разделы, 033)", () => {
  const views = (perms?: string[]) => navFor("warehouse", perms).map((n) => n.view);

  it("без прав (демо) и у руководителя — всё", () => {
    expect(views()).toEqual(views(["staff.manage"]));
    expect(views()).toContain("integrations");
  });

  it("старшему смены — без настройки склада, с персоналом на чтение", () => {
    const lead = views([
      "staff.view",
      "plan.view",
      "products.view",
      "stock.view",
      "stock.move",
      "picking.view",
      "picking.do",
      "goods.view",
      "goods.decide",
      "chat.use",
    ]);
    for (const v of ["spec", "operations", "integrations", "devices"])
      expect(lead).not.toContain(v);
    for (const v of ["tasks", "disputes", "chat", "staff", "analytics", "workstation"])
      expect(lead).toContain(v);
  });

  it("сборщику — его работа, без спорного, чата и персонала", () => {
    const picker = views([
      "products.view",
      "stock.view",
      "plan.view",
      "picking.view",
      "picking.do",
    ]);
    expect(picker).toContain("tasks");
    expect(picker).toContain("workstation");
    for (const v of ["disputes", "chat", "staff", "analytics", "spec"])
      expect(picker).not.toContain(v);
  });
});
