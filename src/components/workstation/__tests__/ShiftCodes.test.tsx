// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useEditor } from "@/lib/store";
import { shiftMarkCode } from "@/lib/workstation";
import { SHIFT_SCAN_EVENT } from "@/components/fulfillment/ScanField";
import { ShiftCodes } from "../ShiftCodes";

/**
 * Конец смены кодом не ставится (Кирилл 27.11): код рядом с «перерывом»
 * легко отсканировать по ошибке. Остаются только быстрые действия на столе.
 */
describe("коды отметок смены", () => {
  beforeEach(() => {
    useEditor.setState({
      staffEvents: [{ id: "e1", staffId: "s1", type: "shift_start", at: Date.now() - 60_000 }],
      toasts: [],
    });
  });

  test("на открытой смене — код перерыва есть, кода конца смены нет", () => {
    render(<ShiftCodes staffId="s1" />);
    expect(screen.getByText("Уйти на перерыв")).toBeTruthy();
    expect(screen.queryByText("Закончить смену")).toBeNull();
  });

  test("старый распечатанный код конца смены смену не закрывает", () => {
    render(<ShiftCodes staffId="s1" />);
    act(() => {
      window.dispatchEvent(
        new CustomEvent(SHIFT_SCAN_EVENT, { detail: shiftMarkCode("shift_end") }),
      );
    });
    const s = useEditor.getState();
    expect(s.staffEvents.some((e) => e.type === "shift_end")).toBe(false);
    expect(s.toasts.at(-1)?.key).toBe("ws.mark.endByButton");
  });
});
