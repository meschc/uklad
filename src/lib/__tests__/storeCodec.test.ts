import { describe, expect, it, vi } from "vitest";
import { packText, unpackText } from "../storeCodec";

describe("storeCodec", () => {
  it("сжатое читается обратно байт в байт, кириллица и эмодзи целы", () => {
    const text = JSON.stringify({
      state: {
        name: "Склад «Север» 🚚",
        rows: Array.from({ length: 2000 }, (_, i) => ({ id: `r${i}`, qty: i })),
      },
    });
    const packed = packText(text);
    expect(packed.startsWith("UKZ1|")).toBe(true);
    expect(packed.length * 2).toBeLessThan(text.length);
    expect(unpackText(packed)).toBe(text);
  });

  it("в сжатом нет половинок суррогатных пар", () => {
    const packed = packText("x".repeat(10_000) + Math.random());
    for (let i = 0; i < packed.length; i++) {
      const c = packed.charCodeAt(i);
      expect(c >= 0xd800 && c <= 0xdfff).toBe(false);
    }
  });

  it("пустая строка и любой хвост байтов проходят круг", () => {
    for (const t of ["", "a", "ab", "абв", "🙂".repeat(7)]) expect(unpackText(packText(t))).toBe(t);
  });

  it("старое сохранение (обычный JSON) читается как есть", () => {
    expect(unpackText('{"state":{}}')).toBe('{"state":{}}');
    expect(unpackText(null)).toBeNull();
  });

  it("битое сжатое — null, а не исключение", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const packed = packText("данные склада ".repeat(100));
    expect(unpackText(packed.slice(0, packed.length / 2))).toBeNull();
    expect(unpackText("UKZ1|abc|xyz")).toBeNull();
    expect(unpackText("UKZ1|5|" + " ".repeat(4))).toBeNull();
  });
});
