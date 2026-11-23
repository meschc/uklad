// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TimeInput } from "../time-input";

function setup(value = 9 * 60) {
  const onChange = vi.fn();
  render(<TimeInput value={value} onChange={onChange} ariaLabel="Время" />);
  return { onChange, input: screen.getByLabelText("Время") as HTMLInputElement };
}

describe("TimeInput", () => {
  it("«1300» после ухода из поля — 13:00", () => {
    const { onChange, input } = setup();
    fireEvent.change(input, { target: { value: "1300" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(13 * 60);
    expect(input.value).toBe("13:00");
  });

  it("Enter тоже фиксирует", () => {
    const { onChange, input } = setup();
    fireEvent.change(input, { target: { value: "930" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(9 * 60 + 30);
  });

  it("часы больше 23 или минуты больше 59 — отказ с подсказкой, значение не меняется", () => {
    const { onChange, input } = setup();
    fireEvent.change(input, { target: { value: "2560" } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("ночное время 00:20 принимается", () => {
    const { onChange, input } = setup(23 * 60 + 40);
    fireEvent.change(input, { target: { value: "0020" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(20);
  });
});
