import { describe, expect, it } from "vitest";
import { PERM_KEYS, PERM_MODULES, groupPermissions, moduleLevel } from "../permModules";

const stock = PERM_MODULES.find((m) => m.id === "stock")!;

describe("права по модулям", () => {
  it("запись сильнее чтения, без прав — ничего", () => {
    expect(moduleLevel(stock, ["stock.view"])).toBe("read");
    expect(moduleLevel(stock, ["stock.view", "stock.move"])).toBe("write");
    expect(moduleLevel(stock, ["stock.move"])).toBe("write");
    expect(moduleLevel(stock, ["chat.use"])).toBe("none");
  });

  it("каждое право с подписью ровно в одном модуле", () => {
    const all = PERM_MODULES.flatMap((m) => [...m.read, ...m.write]);
    expect(new Set(all).size).toBe(all.length);
    expect(new Set(all)).toEqual(new Set(Object.keys(PERM_KEYS)));
  });

  it("неизвестное право не теряется — уходит в «Прочее»", () => {
    const g = groupPermissions(["stock.view", "future.perm", "chat.use"]);
    expect(g.map((x) => [x.module?.id ?? null, x.codes])).toEqual([
      ["stock", ["stock.view"]],
      ["chat", ["chat.use"]],
      [null, ["future.perm"]],
    ]);
  });
});
