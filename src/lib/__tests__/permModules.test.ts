import { describe, expect, it } from "vitest";
import { ru } from "../i18n/warehouse";
import {
  OWNER_PERM,
  PERM_AREAS,
  areaCodes,
  areaLevel,
  grantableLevels,
  groupPermissions,
  normalizePerms,
  withLevel,
} from "../permModules";

const byId = (id: string) => PERM_AREAS.find((a) => a.id === id)!;

describe("права по разделам: нет, чтение, чтение и запись", () => {
  it("каждое право ровно в одном разделе, у каждого раздела подписи", () => {
    const all = PERM_AREAS.flatMap(areaCodes);
    expect(new Set(all).size).toBe(all.length);
    expect(all).not.toContain(OWNER_PERM);
    for (const a of PERM_AREAS) {
      expect(ru).toHaveProperty(a.title);
      expect(ru).toHaveProperty(a.writeDesc);
      if (a.readDesc) expect(ru).toHaveProperty(a.readDesc);
    }
  });

  it("уровень раздела — один из трёх, «выборочно» не бывает", () => {
    const picking = byId("picking");
    expect(areaLevel(new Set(), picking)).toBe("none");
    expect(areaLevel(new Set(["picking.view"]), picking)).toBe("read");
    expect(areaLevel(new Set(["picking.view", "picking.do"]), picking)).toBe("write");
    // Старая роль: «делать» без «смотреть» — это запись, сохранение добавит чтение.
    expect(areaLevel(new Set(["picking.do"]), picking)).toBe("write");
    expect(normalizePerms(new Set(["picking.do"]))).toEqual(
      new Set(["picking.view", "picking.do"]),
    );
  });

  it("уровень меняет только свой раздел", () => {
    const stock = byId("stock");
    const all = withLevel(new Set(["chat.view"]), stock, "write");
    expect(all).toEqual(new Set(["chat.view", "stock.view", "stock.move"]));
    expect(withLevel(all, stock, "read")).toEqual(new Set(["chat.view", "stock.view"]));
    expect(withLevel(all, stock, "none")).toEqual(new Set(["chat.view"]));
  });

  it("разные работы стола — разные разделы: сборщику только сборка", () => {
    let p = new Set<string>();
    p = withLevel(p, byId("picking"), "write");
    p = withLevel(p, byId("stock"), "read");
    for (const a of PERM_AREAS) {
      const want = a.id === "picking" ? "write" : a.id === "stock" ? "read" : "none";
      expect(areaLevel(p, a)).toBe(want);
    }
  });

  it("у списания нет отдельного чтения: «чтение» не предлагается", () => {
    const w = byId("writeoff");
    expect(w.read).toBeNull();
    expect(grantableLevels(w, new Set(["goods.writeoff"]))).toEqual(["none", "write"]);
    expect(withLevel(new Set(), w, "read")).toEqual(new Set());
  });

  it("больше своих не дать: уровни по правам самого человека", () => {
    const s = byId("staff");
    expect(grantableLevels(s, new Set())).toEqual(["none"]);
    expect(grantableLevels(s, new Set(["staff.view"]))).toEqual(["none", "read"]);
    expect(grantableLevels(s, new Set(["staff.view", "staff.manage"]))).toEqual([
      "none",
      "read",
      "write",
    ]);
  });

  it("раздел без прав на сервере не показан, чужое право — в «Прочем»", () => {
    const g = groupPermissions(["stock.view", "stock.move", "future.perm", OWNER_PERM]);
    expect(g.areas.map((a) => a.id)).toEqual(["stock"]);
    expect(g.rest).toEqual(["future.perm"]);
  });
});
