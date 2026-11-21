import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { APP_VERSION } from "../version";

/**
 * Кабинет и тег релиза считают версию одним правилом: база из `package.json`
 * плюс число записей в `changes/`. Разойдись счёт — кабинет показал бы одну
 * версию, а релиз на GitHub назвался бы другой.
 */
describe("версия продукта", () => {
  it("кабинет считает так же, как scripts/release.mjs", () => {
    const fromScript = execFileSync("node", ["scripts/release.mjs", "version"], {
      encoding: "utf8",
    }).trim();
    expect(APP_VERSION).toBe(fromScript);
  });

  it("записи в changes/ по форме", () => {
    // Падает с перечнем того, что не так; молчит — все записи годятся.
    expect(() =>
      execFileSync("node", ["scripts/release.mjs", "check", "HEAD"], { stdio: "pipe" }),
    ).not.toThrow();
  });
});
