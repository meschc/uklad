// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useEditor } from "@/lib/store";
import { ShipmentPicker } from "../ShipmentPicker";

/**
 * «Новая поставка» — право старшего смены. Приёмщик у стола берёт заведённую
 * поставку и не заводит свою: иначе приёмка идёт без сверки с планом.
 */
describe("ShipmentPicker — право заводить поставку", () => {
  beforeEach(() => {
    useEditor.setState({ expectedShipments: [] });
  });

  test("старший видит кнопку «Новая поставка» и при пустом списке", () => {
    render(<ShipmentPicker onPick={vi.fn()} onFreeform={vi.fn()} canCreate />);

    expect(screen.getByRole("button", { name: /Новая поставка/ })).toBeTruthy();
  });

  test("у приёмщика кнопки нет, а пустой экран говорит, к кому идти", () => {
    render(<ShipmentPicker onPick={vi.fn()} onFreeform={vi.fn()} canCreate={false} />);

    expect(screen.queryByRole("button", { name: /Новая поставка/ })).toBeNull();
    expect(screen.getByText("Ожидаемых поставок нет")).toBeTruthy();
  });

  test("по умолчанию право есть: кабинет руководителя не меняется", () => {
    render(<ShipmentPicker onPick={vi.fn()} onFreeform={vi.fn()} />);

    expect(screen.getByRole("button", { name: /Новая поставка/ })).toBeTruthy();
  });
});
