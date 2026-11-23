// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TableScroll } from "../table-scroll";

describe("TableScroll", () => {
  it("рисует таблицу без рамки и с прокруткой по горизонтали", () => {
    const { container } = render(
      <TableScroll>
        <table>
          <tbody>
            <tr>
              <td>ячейка</td>
            </tr>
          </tbody>
        </table>
      </TableScroll>,
    );
    const scroller = screen.getByTestId("table-scroll");
    expect(scroller.className).toContain("overflow-x-auto");
    expect(container.firstElementChild?.className).not.toContain("border");
    // Тень у края видна, только если есть куда прокручивать: в jsdom ширин нет.
    expect(container.querySelector("[data-edge=left]")?.className).toContain("opacity-0");
    expect(container.querySelector("[data-edge=right]")?.className).toContain("opacity-0");
  });
});
