// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { render } from "@testing-library/react";
import { RowCheck } from "../RowCheck";

/**
 * «Дёргается кнопка» (разбор 27.11): у флажка без значка или с полоской-span
 * другая базовая линия, и шапка таблицы прыгала на 1–3 px при первой отметке.
 * Содержимое во всех трёх состояниях — один svg одного размера.
 */
describe("флажок строки", () => {
  test("пусто, отмечено и «часть» — одинаковый svg внутри", () => {
    const states = [{ checked: false }, { checked: true }, { checked: false, partial: true }];
    const inner = states.map((s) => {
      const { container, unmount } = render(<RowCheck {...s} onChange={() => {}} label="x" />);
      const kids = [...container.querySelector("button")!.children];
      unmount();
      return kids.map((k) => `${k.tagName.toLowerCase()}.${k.classList.contains("size-3")}`);
    });
    expect(inner).toEqual([["svg.true"], ["svg.true"], ["svg.true"]]);
  });
});
