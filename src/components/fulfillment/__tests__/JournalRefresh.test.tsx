// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEditor } from "@/lib/store";
import { JournalScreen } from "../JournalScreen";

/**
 * Журнал обновляется вручную (Кирилл 27.11): свежие записи не вклеиваются
 * сами, кнопка показывает, сколько их, и по нажатию добавляет.
 */
describe("журнал — ручное обновление", () => {
  afterEach(() => vi.useRealTimers());

  test("новая запись ждёт кнопку «Обновить»", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const staffId = useEditor.getState().warehouse.staff?.[0]?.id ?? "s1";
    useEditor.setState({
      staffEvents: [{ id: "old", staffId, type: "shift_start", at: Date.now() - 60_000 }],
    });
    render(<JournalScreen />);
    expect(await screen.findAllByText("Начал смену")).toHaveLength(1);

    act(() => {
      useEditor.setState((s) => ({
        staffEvents: [
          ...s.staffEvents,
          { id: "new", staffId, type: "break_start", at: Date.now() },
        ],
      }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    // Строка не появилась сама — только счётчик на кнопке.
    expect(screen.queryByText("Ушёл на перерыв")).toBeNull();
    const btn = await screen.findByRole("button", { name: /Обновить · новых 1/ });
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(btn);
    expect(await screen.findByText("Ушёл на перерыв")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Обновить" })).toBeTruthy();
  });
});
