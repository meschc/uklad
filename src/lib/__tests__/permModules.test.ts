import { describe, expect, it } from "vitest";
import { PERM_DESC, PERM_KEYS, PERM_SECTIONS, groupPermissions } from "../permModules";

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
});
