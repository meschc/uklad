import { describe, expect, it } from "vitest";
import { formatTimeText, parseTimeText } from "../timeText";

describe("parseTimeText", () => {
  it("«1300» → 13:00, «930» → 09:30, «9» → 09:00", () => {
    expect(parseTimeText("1300")).toBe(13 * 60);
    expect(parseTimeText("930")).toBe(9 * 60 + 30);
    expect(parseTimeText("9")).toBe(9 * 60);
    expect(parseTimeText("13")).toBe(13 * 60);
  });
  it("понимает двоеточие, точку и запятую", () => {
    expect(parseTimeText("13:40")).toBe(13 * 60 + 40);
    expect(parseTimeText("9:5")).toBe(9 * 60 + 5);
    expect(parseTimeText("02.15")).toBe(2 * 60 + 15);
  });
  it("часы до 23 и минуты до 59", () => {
    expect(parseTimeText("2400")).toBeNull();
    expect(parseTimeText("24")).toBeNull();
    expect(parseTimeText("1260")).toBeNull();
    expect(parseTimeText("2359")).toBe(23 * 60 + 59);
    expect(parseTimeText("0000")).toBe(0);
  });
  it("мусор — отказ", () => {
    expect(parseTimeText("")).toBeNull();
    expect(parseTimeText("абв")).toBeNull();
    expect(parseTimeText("12345")).toBeNull();
    expect(parseTimeText("1:2:3")).toBeNull();
  });
});

describe("formatTimeText", () => {
  it("по кругу суток, ночная смена", () => {
    expect(formatTimeText(13 * 60)).toBe("13:00");
    expect(formatTimeText(1440 + 20)).toBe("00:20");
    expect(formatTimeText(-20)).toBe("23:40");
  });
});
