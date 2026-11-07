import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Политика CSP на сервере строгая (`deploy/Caddyfile`): встроенный скрипт
 * исполняется, только если его хэш перечислен в `script-src`. Правка текста
 * скрипта темы без нового хэша молча ломает выбор темы на всём сайте —
 * заметно это только в консоли браузера. Тест ловит расхождение до выкладки.
 */
const root = path.resolve(__dirname, "../..");
const read = (f: string) => readFileSync(path.join(root, f), "utf8");

const inlineHashes = (html: string) =>
  [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)]
    .filter((m) => !/application\/ld\+json/.test(m[1]))
    .map((m) => `'sha256-${createHash("sha256").update(m[2]).digest("base64")}'`);

describe("CSP", () => {
  const caddy = read("deploy/Caddyfile");
  const header = caddy.match(/^\s*Content-Security-Policy(-Report-Only)? "([^"]+)"/m);
  const scriptSrc = header?.[2].match(/script-src ([^;]+)/)?.[1] ?? "";

  it("заголовок строгий, а не «только отчёт», и без 'unsafe-inline' для скриптов", () => {
    expect(header?.[1]).toBeUndefined();
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it.each(["index.html", "app/index.html"])("встроенные скрипты %s разрешены хэшем", (f) => {
    const hashes = inlineHashes(read(f));
    expect(hashes.length).toBeGreaterThan(0);
    for (const h of hashes) expect(scriptSrc, `добавьте ${h} в Caddyfile`).toContain(h);
  });
});
