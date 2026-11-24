// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { render } from "@testing-library/react";
import type { LabelTemplate } from "@/lib/types";
import { LabelCard } from "../LabelCard";

/**
 * Ярлык товара (Кирилл 24.11, в третий раз): сверху название, под ним
 * штрихкод, под штрихкодом цифры. Порядок проверяется по DOM: вёрстку
 * переставить легко, а заметить — только на напечатанном ярлыке.
 */
const TPL: LabelTemplate = {
  id: "t",
  name: "58×40",
  widthMm: 58,
  heightMm: 40,
  layout: "horizontal",
  codeType: "barcode",
  elements: ["title", "code"],
  codeScale: 0.6,
  createdAt: 0,
};

describe("ярлык товара", () => {
  test("название сверху, потом штрихкод, потом цифры", () => {
    const { container } = render(
      <LabelCard
        tpl={TPL}
        code="4600051000019"
        kind="custom"
        headline="Футболка хлопковая, XS, чёрный"
        warehouseName="Склад"
      />,
    );
    const label = container.querySelector(".print-label")!;
    const parts = [...label.children];
    expect(parts[0].textContent).toBe("Футболка хлопковая, XS, чёрный");
    expect(parts[1].querySelector("svg")).not.toBeNull();
    expect(parts[2].textContent?.replace(/\s/g, "")).toBe("4600051000019");
  });
});
