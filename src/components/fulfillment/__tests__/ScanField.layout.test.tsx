// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScanField } from "../ScanField";

/** Обход столов 15.11: номер машины кириллицей становился латиницей. */
describe("ScanField: раскладка", () => {
  test("keepLayout — кириллица остаётся как набрали", async () => {
    const onSubmit = vi.fn();
    render(<ScanField label="Машина" keepLayout onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText("Машина"), "А123ВВ777{Enter}");
    expect(onSubmit).toHaveBeenCalledWith("А123ВВ777");
  });

  test("по умолчанию русская раскладка переводится (коды товаров)", async () => {
    const onSubmit = vi.fn();
    render(<ScanField label="Скан" onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText("Скан"), "ГЛ{Enter}");
    expect(onSubmit).toHaveBeenCalledWith("UK");
  });
});
