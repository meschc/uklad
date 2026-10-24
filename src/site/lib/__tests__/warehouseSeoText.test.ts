import { describe, expect, it } from "vitest";
import { warehousesRepository } from "../../data/warehousesRepository";
import { money } from "../../data/warehouses";
import { pick, type Copy, type TFunc, type Vars } from "../copy";
import { warehouseSeoText } from "../warehouseSeoText";

function tFor(lang: "ru" | "en"): TFunc {
  const t = ((copy: Copy, vars?: Vars) => pick(lang, copy, vars)) as TFunc;
  t.lang = lang;
  t.plural = (n, ru, en) => (lang === "ru" ? ru[0] : n === 1 ? en[0] : en[1]);
  return t;
}

describe("warehouseSeoText", () => {
  const all = warehousesRepository.list();

  // Текст собирается из карточки сам, и ошибиться он может только молча:
  // «undefined» посреди абзаца поисковик проглотит, а глазами его не ищут.
  it.each(["ru", "en"] as const)("у каждого склада текст без дыр (%s)", (lang) => {
    const t = tFor(lang);
    for (const w of all) {
      const text = warehouseSeoText(t, w).join(" ");
      expect(text).not.toMatch(/undefined|NaN|null|\[object/);
      expect(text).toContain(t(w.cityTitle));
      expect(text).toContain(t(w.address));
      expect(text).toContain(`${money(w.price.storage)} ₽`);
    }
  });

  it("называет город, площадь и свободные места словами", () => {
    const w = all[0];
    const text = warehouseSeoText(tFor("ru"), w).join(" ");
    expect(text).toContain("арендовать место на складе фулфилмента");
    expect(text).toContain(`${money(w.areaM2)} м²`);
    expect(text).toContain(`свободно ${money(w.cellsFree)} из ${money(w.cellsTotal)}`);
  });
});
