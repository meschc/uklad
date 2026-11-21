/**
 * Версия продукта для интерфейса (правило — CLAUDE.md, «Версия продукта»).
 * Числом нигде не хранится: база из `package.json` плюс число записей в
 * `changes/` — тот же счёт, что у `scripts/release.mjs`. Берётся при сборке:
 * Vite встраивает базу одной строкой, а от записей — только список имён.
 */
import { version as base } from "../../package.json";

const entries = Object.keys(import.meta.glob("/changes/*.md")).filter(
  (path) => !path.endsWith("/README.md"),
);

/** База `0.9.14` + 3 записи → `0.9.17`. */
function versionFrom(baseVersion: string, count: number): string {
  const [major, minor, patch] = baseVersion.split(".").map(Number);
  return `${major}.${minor}.${patch + count}`;
}

export const APP_VERSION: string = versionFrom(base, entries.length);
