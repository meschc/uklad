import { describe, expect, it } from "vitest";
import { normalizePath, suggestPages } from "../suggestPath";

const first = (p: string) => suggestPages(p)[0].to;

describe("suggestPages", () => {
  it.each([
    ["/tarif", "/pricing"],
    ["/pricng/", "/pricing"],
    ["/%D1%82%D0%B0%D1%80%D0%B8%D1%84%D1%8B", "/pricing"],
    ["/kontakty", "/contacts"],
    ["/contact", "/contacts"],
    ["/roadmp", "/roadmap"],
    ["/sklad", "/warehouses"],
    ["/legal/privcy", "/legal/privacy"],
    ["/en/pricing", "/pricing"],
  ])("%s → %s", (input, to) => {
    expect(first(input)).toBe(to);
  });

  it("всегда три подсказки и без повторов", () => {
    for (const p of ["/qwertyuiop", "/tarif", ""]) {
      const tos = suggestPages(p).map((h) => h.to);
      expect(tos).toHaveLength(3);
      expect(new Set(tos).size).toBe(3);
    }
  });

  it("на непохожее предлагает главные страницы", () => {
    expect(suggestPages("/qwertyuiop").map((h) => h.to)).toEqual(["/", "/warehouses", "/pricing"]);
  });

  it("скрытые до запуска страницы не подсказывает", () => {
    expect(suggestPages("/market").some((h) => h.to.startsWith("/market"))).toBe(false);
    expect(suggestPages("/sellers").some((h) => h.to.startsWith("/sellers"))).toBe(false);
  });
});

describe("normalizePath", () => {
  it("снимает язык, слеши и регистр", () => {
    expect(normalizePath("/EN/Pricing/")).toBe("pricing");
  });
});
