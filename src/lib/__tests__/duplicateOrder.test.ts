import { describe, expect, it } from "vitest";
import { findDuplicateOrder } from "../fulfillment";
import { makeRequest } from "./fixtures";

/**
 * Один заказ площадки дважды — две сборки и две отгрузки. Форма заявки
 * предупреждает по этому правилу, поэтому проверяем границы: что считается
 * дублем и что нет.
 */
const ozon = (id: string, over = {}) =>
  makeRequest({ id, source: "ozon", externalId: "12345-0001", ...over });

describe("findDuplicateOrder", () => {
  it("находит живую заявку с тем же источником и номером, без учёта регистра и пробелов", () => {
    const found = findDuplicateOrder([ozon("r1", { externalId: "AB-1" })], "ozon", "  ab-1 ");

    expect(found?.id).toBe("r1");
  });

  it("отменённая заявка дублем не считается: заказ можно завести заново", () => {
    expect(findDuplicateOrder([ozon("r1", { status: "cancelled" })], "ozon", "12345-0001")).toBe(
      undefined,
    );
  });

  it("тот же номер на другой площадке — другой заказ", () => {
    expect(findDuplicateOrder([ozon("r1")], "wildberries", "12345-0001")).toBeUndefined();
  });

  it("своя заявка и пустой номер дублем не бывают", () => {
    expect(findDuplicateOrder([ozon("r1")], "manual", "12345-0001")).toBeUndefined();
    expect(findDuplicateOrder([ozon("r1")], "ozon", "   ")).toBeUndefined();
    expect(findDuplicateOrder([ozon("r1")], undefined, undefined)).toBeUndefined();
  });
});
