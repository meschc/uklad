import { describe, expect, it } from "vitest";
import {
  DEFAULT_LABEL_PRINTER,
  normalizeLabelPrinter,
  parseLabelPrinter,
  sizeLabel,
} from "../labelPrinter";

describe("настройка принтера этикеток", () => {
  it("пустое и битое значение дают настройку по умолчанию", () => {
    expect(parseLabelPrinter(null)).toEqual(DEFAULT_LABEL_PRINTER);
    expect(parseLabelPrinter("{не json")).toEqual(DEFAULT_LABEL_PRINTER);
    expect(parseLabelPrinter("42")).toEqual(DEFAULT_LABEL_PRINTER);
  });

  it("читает сохранённое имя и размер", () => {
    const raw = JSON.stringify({ name: " Zebra ZD220 ", widthMm: 100, heightMm: 150 });
    expect(parseLabelPrinter(raw)).toEqual({ name: "Zebra ZD220", widthMm: 100, heightMm: 150 });
  });

  it("держит размер в разумных миллиметрах", () => {
    const p = normalizeLabelPrinter({ widthMm: 5, heightMm: 5000 });
    expect(p.widthMm).toBe(20);
    expect(p.heightMm).toBe(200);
    expect(normalizeLabelPrinter({ widthMm: NaN }).widthMm).toBe(DEFAULT_LABEL_PRINTER.widthMm);
  });

  it("режет длинное имя", () => {
    expect(normalizeLabelPrinter({ name: "x".repeat(200) }).name).toHaveLength(60);
  });

  it("пишет размер через ×", () => {
    expect(sizeLabel({ widthMm: 58, heightMm: 40 })).toBe("58×40");
  });
});
