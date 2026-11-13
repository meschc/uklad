import { describe, expect, it } from "vitest";
import { destinationMark } from "../destinationMark";

describe("destinationMark", () => {
  it("одно назначение — один цвет и звук, без учёта регистра и пробелов", () => {
    expect(destinationMark("WB Коледино")).toEqual(destinationMark("  wb коледино "));
  });

  it("разные назначения расходятся по палитре", () => {
    const names = [
      "WB Коледино",
      "WB Электросталь",
      "Ozon Хоругвино",
      "ЯМ Софьино",
      "ПВЗ Ленина 5",
    ];
    const tokens = new Set(names.map((n) => destinationMark(n).token));
    expect(tokens.size).toBeGreaterThanOrEqual(3);
  });

  it("без зелёного и красного — они заняты под «готово» и «ошибку»", () => {
    for (const n of ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "ПВЗ Ленина 5"]) {
      expect(["--tag-integrations", "--tag-bug"]).not.toContain(destinationMark(n).token);
    }
  });

  it("на жёлтом, салатовом и оранжевом — тёмный текст", () => {
    for (const n of ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"]) {
      const m = destinationMark(n);
      const light = ["--tag-fulfillment", "--tag-market", "--tag-sellers"].includes(m.token);
      expect(m.darkInk).toBe(light);
    }
  });
});
