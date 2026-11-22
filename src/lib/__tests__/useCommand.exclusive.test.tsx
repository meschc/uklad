// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { ok } from "../data/result";
import { useCommand } from "../useCommand";

/**
 * «Что если нажать дважды или 1000 раз» (Кирилл 22.11). Выпуск бейджа гасит
 * прежний: два выпуска подряд оставили бы на экране, возможно, уже
 * погашенный код. `exclusive` пускает один запрос, пока он идёт.
 */
describe("useCommand exclusive", () => {
  test("1000 нажатий, пока запрос идёт, — один запрос и один ответ всем", async () => {
    let release!: () => void;
    const action = vi.fn(
      () => new Promise<ReturnType<typeof ok<string>>>((r) => (release = () => r(ok("code")))),
    );
    const { result } = renderHook(() => useCommand(action, { exclusive: true }));
    let runs: Promise<unknown>[] = [];
    act(() => {
      runs = Array.from({ length: 1000 }, () => result.current.run());
    });
    expect(action).toHaveBeenCalledTimes(1);
    await act(async () => {
      release();
      await Promise.all(runs);
    });
    expect(await runs[999]).toEqual(ok("code"));
    // Запрос закончился — следующее нажатие снова доходит до сервера.
    await act(async () => {
      const next = result.current.run();
      release();
      await next;
    });
    expect(action).toHaveBeenCalledTimes(2);
  });

  test("без exclusive каждый вызов — свой (сканы не теряются)", () => {
    const action = vi.fn(async (code: string) => ok(code));
    const { result } = renderHook(() => useCommand(action));
    act(() => {
      void result.current.run("a");
      void result.current.run("b");
    });
    expect(action).toHaveBeenCalledTimes(2);
  });
});
