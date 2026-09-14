// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useRowPicking } from "../useRowPicking";

describe("отметки строк таблицы", () => {
  it("повторный клик по строке снимает отметку", () => {
    const { result } = renderHook(() => useRowPicking(["a", "b"]));

    act(() => result.current.toggle("a"));
    act(() => result.current.toggle("a"));

    expect(result.current.picked.size).toBe(0);
  });

  it("Shift тянет диапазон от предыдущей отмеченной строки", () => {
    const { result } = renderHook(() => useRowPicking(["a", "b", "c", "d"]));

    act(() => result.current.toggle("a"));
    act(() => result.current.toggle("c", true));

    expect([...result.current.picked].sort()).toEqual(["a", "b", "c"]);
  });

  it("Shift-диапазон добавляет, а не переключает уже отмеченное", () => {
    const { result } = renderHook(() => useRowPicking(["a", "b", "c"]));

    act(() => result.current.toggle("b"));
    act(() => result.current.toggle("a"));
    act(() => result.current.toggle("c", true));

    expect([...result.current.picked].sort()).toEqual(["a", "b", "c"]);
  });

  it("«выделить всё» берёт только видимые, а отметки скрытых фильтром не теряет", () => {
    const { result, rerender } = renderHook(({ ids }: { ids: string[] }) => useRowPicking(ids), {
      initialProps: { ids: ["a", "b", "c"] },
    });

    act(() => result.current.toggle("a"));
    rerender({ ids: ["b", "c"] });
    act(() => result.current.toggleAllVisible());

    expect([...result.current.picked].sort()).toEqual(["a", "b", "c"]);
  });

  it("шапка знает про «часть отмечена» и про «отмечено всё»", () => {
    const { result } = renderHook(() => useRowPicking(["a", "b"]));

    act(() => result.current.toggle("a"));
    expect(result.current.someVisiblePicked).toBe(true);
    expect(result.current.allVisiblePicked).toBe(false);

    act(() => result.current.toggle("b"));
    expect(result.current.allVisiblePicked).toBe(true);
    expect(result.current.someVisiblePicked).toBe(false);
  });
});
