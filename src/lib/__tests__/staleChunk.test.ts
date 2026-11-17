import { describe, expect, it } from "vitest";
import { isStaleChunk } from "../staleChunk";

describe("isStaleChunk", () => {
  it("узнаёт устаревший кусок сборки в Safari, Chrome и Firefox", () => {
    expect(isStaleChunk(new TypeError("Importing a module script failed."))).toBe(true);
    expect(
      isStaleChunk(new TypeError("Failed to fetch dynamically imported module: /app/assets/x.js")),
    ).toBe(true);
    expect(isStaleChunk(new TypeError("error loading dynamically imported module"))).toBe(true);
  });

  it("обычную ошибку экрана не считает устаревшей сборкой", () => {
    expect(isStaleChunk(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isStaleChunk(undefined)).toBe(false);
  });
});
