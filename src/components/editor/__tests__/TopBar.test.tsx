// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { useEditor } from "@/lib/store";
import { TopBar } from "../TopBar";

/** «Сохранить» и «Распечатать план» — только на плане, в таблице товаров их нет. */
describe("TopBar: кнопки плана", () => {
  test("в таблице нет статуса сохранения и печати плана", () => {
    useEditor.setState({ mode: "table" });
    render(<TopBar />);
    expect(screen.queryByTitle(/Печать плана/i)).toBeNull();
    expect(screen.queryByTitle(/сохраняются автоматически/i)).toBeNull();
  });

  test("на плане они есть", () => {
    useEditor.setState({ mode: "2d" });
    render(<TopBar />);
    expect(screen.getByRole("button", { name: /Печать плана/i })).toBeTruthy();
    expect(screen.getByTitle(/сохраняются автоматически/i)).toBeTruthy();
  });
});
