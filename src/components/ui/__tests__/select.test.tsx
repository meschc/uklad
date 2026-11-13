// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Select } from "../select";

function renderSelect(onChange = vi.fn(), value = "b") {
  render(
    <Select value={value} onChange={onChange} aria-label="Город">
      <option value="a">Альфа</option>
      {["b", "c"].map((v) => (
        <option key={v} value={v}>
          {v === "b" ? "Бета" : "Гамма"}
        </option>
      ))}
      <option value="d" disabled>
        Дельта
      </option>
    </Select>,
  );
  return onChange;
}

describe("Select", () => {
  it("показывает выбранное и отдаёт выбор как событие select", () => {
    const onChange = renderSelect();
    const box = screen.getByRole("combobox", { name: "Город" });
    expect(box.textContent).toContain("Бета");
    fireEvent.click(box);
    fireEvent.click(screen.getByRole("option", { name: "Гамма" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ target: { value: "c" } }));
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("ходит стрелками, не уходит на недоступное и выбирает Enter", () => {
    const onChange = renderSelect();
    const box = screen.getByRole("combobox");
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ target: { value: "c" } }));
  });

  it("не зовёт onChange на то же значение и закрывается по Escape", () => {
    const onChange = renderSelect();
    const box = screen.getByRole("combobox");
    fireEvent.click(box);
    fireEvent.click(screen.getByRole("option", { name: "Бета" }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(box);
    fireEvent.keyDown(box, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
