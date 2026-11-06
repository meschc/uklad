import { describe, expect, it } from "vitest";
import { planLabel, splitCode, type LabelPlanInput } from "../labelLayout";
import { targetCode } from "../packing";

const ALL = ["title", "seq", "code", "warehouse", "date", "fragile"] as const;
const plan = (w: number, h: number, over: Partial<LabelPlanInput> = {}) =>
  planLabel({
    widthMm: w,
    heightMm: h,
    layout: w >= h ? "horizontal" : "vertical",
    codeType: "qr",
    elements: ALL,
    digits: 4,
    ...over,
  });

const SIZES: [number, number][] = [
  [58, 40],
  [40, 58],
  [43, 25],
  [25, 43],
  [100, 150],
  [150, 100],
];

describe("раскладка наклейки", () => {
  it("поля малые, а не процент ленты", () => {
    for (const [w, h] of SIZES) expect(plan(w, h).padMm).toBeLessThanOrEqual(2.5);
  });

  it("код занимает всю короткую сторону внутри полей", () => {
    // Вертикально — ширину, горизонтально — высоту (если остаётся место тексту).
    expect(plan(40, 58).code.w).toBeCloseTo(40 - 2 * plan(40, 58).padMm, 1);
    expect(plan(58, 40).code.h).toBeGreaterThan(30);
  });

  it("код и текст помещаются в ленту", () => {
    for (const [w, h] of SIZES) {
      const p = plan(w, h);
      if (p.horizontal)
        expect(p.code.w + p.rest.w + p.gapMm).toBeLessThanOrEqual(w - 2 * p.padMm + 0.01);
      else expect(p.code.h + p.rest.h + p.gapMm).toBeLessThanOrEqual(h - 2 * p.padMm + 0.01);
    }
  });

  it("номер есть на любой ленте, шапки на мелкой нет", () => {
    for (const [w, h] of SIZES) expect(plan(w, h).show.number).toBe(true);
    expect(plan(43, 25).show.header).toBe(false);
    expect(plan(58, 40).show.header).toBe(false);
    // Шапка («Тара», логотип) — последняя в очереди: сначала номер, служебная строка и склад.
  });

  it("«Хрупкое» не пропадает раньше даты", () => {
    for (const [w, h] of SIZES) {
      const s = plan(w, h).show;
      if (s.date) expect(s.fragile).toBe(true);
    }
  });

  it("на 100×150 помещается всё, включая «Хрупкое»", () => {
    const s = plan(100, 150).show;
    expect(s.seq && s.date && s.fragile).toBe(true);
  });

  it("лишнее скрывается, а не вылезает: нет места — нет строки", () => {
    const tiny = plan(43, 25, { extraLines: 5 });
    expect(tiny.infoCount).toBeLessThan(6);
  });

  it("крупная подпись получателя занимает место, если оно есть", () => {
    expect(plan(100, 150, { headline: true, elements: ["code"] }).show.headline).toBe(true);
    // Подпись получателя вытесняет служебную строку, а не номер.
    const small = plan(43, 25, { headline: true });
    expect(small.show.number).toBe(true);
  });
});

describe("номер на наклейке", () => {
  it("делится на мелкий префикс и крупный номер", () => {
    expect(splitCode("UK-BOX-1234")).toEqual({ prefix: "UK-BOX", number: "1234" });
    expect(splitCode("UK-ORD-AB12CD")).toEqual({ prefix: "UK-ORD", number: "AB12CD" });
    expect(splitCode("ABC")).toEqual({ prefix: "", number: "ABC" });
  });
});

describe("код этикетки отправления", () => {
  it("один и тот же для одного назначения и разный для разных", () => {
    expect(targetCode("Константинова 1")).toBe(targetCode(" константинова 1 "));
    expect(targetCode("Константинова 1")).not.toBe(targetCode("Леруа Мерлен"));
    expect(targetCode("Леруа Мерлен")).toMatch(/^UK-OUT-[0-9A-Z]{6}$/);
  });
});

describe("planLabel: всё помещается в ленту", () => {
  const sizes = [
    [43, 25],
    [58, 40],
    [40, 58],
    [58, 60],
    [100, 70],
    [100, 150],
  ] as const;
  for (const [w, h] of sizes) {
    for (const codeType of ["qr", "barcode"] as const) {
      it(`${w}×${h} ${codeType}: 13-значный номер и длинная подпись по ширине`, () => {
        const p = planLabel({
          widthMm: w,
          heightMm: h,
          layout: w > h ? "horizontal" : "vertical",
          codeType,
          elements: ["code", "seq", "warehouse"],
          digits: 13,
          headline: true,
          headlineWord: 12,
          headlineLen: 40,
          infoMaxLen: 30,
        });
        const numberW = p.numberMm * 13 * 0.62;
        expect(numberW).toBeLessThanOrEqual(p.rest.w + 0.01);
        if (p.infoCount > 0) expect(p.infoMm * 30 * 0.62).toBeLessThanOrEqual(p.rest.w + 0.01);
        if (p.show.headline) {
          expect(p.headlineMm * 12 * 0.56).toBeLessThanOrEqual(p.rest.w + 0.01);
          expect(p.headlineMm * 40 * 0.56).toBeLessThanOrEqual(2 * p.rest.w + 0.01);
        }
      });
    }
  }
});
