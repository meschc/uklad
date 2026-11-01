// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readCabinetShowcase } from "../cabinetShowcase";

const KEY = "uklad-store-v1";

describe("readCabinetShowcase", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("без сохранения предпросмотра нет", () => {
    expect(readCabinetShowcase()).toBeNull();
  });

  it.each([
    ["не JSON", "{oops"],
    ["null", "null"],
    ["состояние не объект", JSON.stringify({ state: 42 })],
    ["склад без этажей", JSON.stringify({ state: { warehouse: { name: "X" } } })],
    [
      "битые этажи и настройки",
      JSON.stringify({
        state: {
          warehouse: { name: "X", floors: [null, { modules: "нет" }], spec: 5 },
          serviceSettings: { enabled: null },
          placements: 7,
        },
      }),
    ],
  ])("мусор (%s) даёт пустой предпросмотр, а не падение", (_, raw) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    localStorage.setItem(KEY, raw);
    expect(() => readCabinetShowcase()).not.toThrow();
  });

  it("исправная запись собирается в карточку", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        state: {
          warehouse: { name: "Склад на Южной", address: "Тула, Южная, 3", floors: [] },
          serviceSettings: { enabled: { packing: true }, prices: { picking: 12 } },
        },
      }),
    );
    const w = readCabinetShowcase();
    expect(w?.city).toBe("Тула");
    expect(w?.schemes).toEqual(["FBS"]);
    expect(w?.price.picking).toBe(12);
  });
});
