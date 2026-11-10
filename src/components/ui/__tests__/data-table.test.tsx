// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDataTable } from "../data-table";

const rows = [
  { name: "Бета", qty: 2 },
  { name: "Альфа", qty: 10 },
  { name: "Гамма", qty: undefined as number | undefined },
];
const cols = [
  { id: "name", value: (r: (typeof rows)[number]) => r.name },
  { id: "qty", value: (r: (typeof rows)[number]) => r.qty },
];

describe("useDataTable", () => {
  it("сортирует числа как числа, пустое — в конец", () => {
    const { result } = renderHook(() => useDataTable(rows, cols, [{ id: "qty", desc: false }]));
    expect(result.current.rows.map((r) => r.name)).toEqual(["Бета", "Альфа", "Гамма"]);
  });

  it("ищет по всем колонкам без учёта регистра", () => {
    const { result } = renderHook(() => useDataTable(rows, cols));
    act(() => result.current.setQuery("альф"));
    expect(result.current.rows.map((r) => r.name)).toEqual(["Альфа"]);
    act(() => result.current.setQuery("10"));
    expect(result.current.rows.map((r) => r.name)).toEqual(["Альфа"]);
  });
});
