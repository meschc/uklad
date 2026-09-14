// @vitest-environment jsdom
import { beforeAll, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEditor } from "@/lib/store";
import { View3D } from "../View3D";

/**
 * Машина без видеокарты — не выдумка: удалённый рабочий стол, выключенное
 * аппаратное ускорение, старый браузер. В этом случае three падает прямо в
 * конструкторе рендерера, и до правки экран просто белел.
 *
 * jsdom как раз такая машина: WebGL в нём нет, и экран обязан это заметить сам.
 * Движок подменён бросающим — если развилка когда-нибудь сломается и до него
 * дойдёт дело, тест упадёт здесь, а не покажет пустой холст.
 */
vi.mock("../engine", () => ({
  Engine: class {
    constructor() {
      throw new Error("Error creating WebGL context.");
    }
  },
}));

describe("3D без видеокарты", () => {
  // Говорим «контекста нет» прямо, а не полагаемся на заглушку jsdom: та отвечает
  // тем же, но пишет в вывод «Not implemented» и читается как сбой теста.
  beforeAll(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  });

  test("экран называет причину, а не белеет", () => {
    // Arrange
    useEditor.setState({ mode: "3d" });

    // Act
    render(<View3D />);

    // Assert
    expect(screen.getByText(/Трёхмерный вид тут не откроется/)).toBeInTheDocument();
    expect(screen.getByText(/WebGL/)).toBeInTheDocument();
  });

  test("уводит обратно на план — работать человеку есть где", async () => {
    // Arrange
    const user = userEvent.setup();
    useEditor.setState({ mode: "3d" });
    render(<View3D />);

    // Act
    await user.click(screen.getByRole("button", { name: "2D-план" }));

    // Assert
    expect(useEditor.getState().mode).toBe("2d");
  });
});
