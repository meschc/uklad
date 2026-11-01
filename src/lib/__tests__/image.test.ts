import { describe, expect, it } from "vitest";
import { IMAGE_MAX_DATA_URL, safeImageUrl } from "../image";

describe("safeImageUrl", () => {
  it("пропускает свой data-URL картинки", () => {
    const url =
      "data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAA";
    expect(safeImageUrl(url)).toBe(url);
  });

  it("убирает чужой адрес и svg", () => {
    expect(safeImageUrl("https://evil.example/pixel.png")).toBeUndefined();
    expect(safeImageUrl("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")).toBeUndefined();
    expect(safeImageUrl("javascript:alert(1)")).toBeUndefined();
  });

  it("убирает слишком длинное и не-строки", () => {
    expect(safeImageUrl("data:image/png;base64," + "A".repeat(IMAGE_MAX_DATA_URL))).toBeUndefined();
    expect(safeImageUrl(42)).toBeUndefined();
    expect(safeImageUrl(undefined)).toBeUndefined();
  });
});
