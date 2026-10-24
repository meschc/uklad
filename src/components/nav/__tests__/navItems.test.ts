import { describe, expect, it } from "vitest";
import { applyOrder, moveItem } from "../navItems";

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
