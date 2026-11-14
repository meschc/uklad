import { describe, expect, it } from "vitest";
import {
  PERM_DESC,
  PERM_KEYS,
  PERM_SECTIONS,
  groupPermissions,
  sectionLevel,
  withLevel,
} from "../permModules";

describe("права по разделам", () => {
  it("каждое право с подписью и объяснением ровно в одном разделе", () => {
    const all = PERM_SECTIONS.flatMap((s) => s.perms);
    expect(new Set(all).size).toBe(all.length);
    expect(new Set(all)).toEqual(new Set(Object.keys(PERM_KEYS)));
    expect(new Set(Object.keys(PERM_DESC))).toEqual(new Set(Object.keys(PERM_KEYS)));
  });

  it("неизвестное право не теряется — уходит в «Прочее»", () => {
    const g = groupPermissions(["stock.view", "future.perm", "chat.use"]);
    expect(g.map((x) => [x.section?.id ?? null, x.codes])).toEqual([
      ["stock", ["stock.view"]],
      ["sellers", ["chat.use"]],
      [null, ["future.perm"]],
    ]);
  });

  it("уровень раздела: нет, чтение, запись и поштучно", () => {
    const stock = PERM_SECTIONS.find((x) => x.id === "stock")!;
    const desk = PERM_SECTIONS.find((x) => x.id === "desk")!;
    const people = PERM_SECTIONS.find((x) => x.id === "people")!;
    expect(sectionLevel(new Set(), stock)).toBe("none");
    expect(sectionLevel(new Set(["stock.view"]), stock)).toBe("read");
    expect(sectionLevel(new Set(["stock.view", "stock.move"]), stock)).toBe("custom");
    const all = withLevel(new Set(["chat.use"]), stock, "write");
    expect(sectionLevel(all, stock)).toBe("write");
    expect(all.has("chat.use")).toBe(true);
    expect(sectionLevel(withLevel(all, stock, "read"), stock)).toBe("read");
    expect(withLevel(all, stock, "none").has("stock.view")).toBe(false);
    // У работы стола чтения нет: «чтение» её выключает.
    expect(sectionLevel(withLevel(new Set(), desk, "read"), desk)).toBe("none");
    // Владельца «запись» не даёт и не требует.
    const boss = withLevel(new Set(), people, "write");
    expect(boss.has("org.manage")).toBe(false);
    expect(sectionLevel(boss, people)).toBe("write");
  });
});
