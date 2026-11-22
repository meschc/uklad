import { describe, expect, test } from "vitest";
import { deviceNameError } from "../deviceName";

/** Разбор staging 22.11: стол можно было назвать «а» или «12345678». */
describe("Имя устройства", () => {
  test.each(["Упаковка 2", "ТСД 1001", "Приёмка, ворота 3", "Pack-1", "  Сортировка  "])(
    "годится: %s",
    (name) => expect(deviceNameError(name)).toBeNull(),
  );
  test.each([
    ["", "ws.device.nameEmpty"],
    ["   ", "ws.device.nameEmpty"],
    ["а", "ws.device.nameShort"],
    ["1 2", "ws.device.nameShort"],
    ["Стол 12345", "ws.device.nameDigits"],
    ["Стол #1", "ws.device.nameChars"],
    ["Стол_1", "ws.device.nameChars"],
    ["Стол!", "ws.device.nameChars"],
    ["Стол 😀", "ws.device.nameChars"],
  ])("не годится: «%s»", (name, key) => expect(deviceNameError(name)).toBe(key));
});
