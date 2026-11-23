import { describe, expect, test } from "vitest";
import { formatBarcode } from "../barcodeFormat";

describe("formatBarcode", () => {
  test("EAN-13 — 1 · 6 · 6", () => {
    expect(formatBarcode("4600051070012")).toBe("4 600051 070012");
  });
  test("EAN-8 и UPC-A", () => {
    expect(formatBarcode("12345670")).toBe("1234 5670");
    expect(formatBarcode("036000291452")).toBe("0 36000 29145 2");
  });
  test("ISBN-13 и ISBN-10 делятся по группам", () => {
    expect(formatBarcode("9785171234567")).toBe("978 5 17123 456 7");
    expect(formatBarcode("5171234567")).toBe("5 17123 456 7");
    expect(formatBarcode("517123456X")).toBe("5 17123 456 X");
  });
  test("наши ярлыки, артикулы и пустое не трогаются", () => {
    for (const s of ["UK-BOX-28", "TS-001-BLK", "", "12345", "46000510700120"]) {
      expect(formatBarcode(s)).toBe(s);
    }
  });
});
