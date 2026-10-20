import { describe, expect, it } from "vitest";
import { PLANS, monthlyFor } from "../../../data/plans";
import { BREAKDOWN, calcMonthly, fittingPlan, LIMITS } from "../tariffsData";

const plan = (id: string) => PLANS.find((p) => p.id === id)!;

describe("цены тарифов", () => {
  it("за полгода −15 %, за год −25 %, до сотен рублей", () => {
    expect(
      ["start", "warehouse", "operator"].map((id) => monthlyFor(plan(id).monthly, "half")),
    ).toEqual([4200, 8400, 21200]);
    expect(
      ["start", "warehouse", "operator"].map((id) => monthlyFor(plan(id).monthly, "year")),
    ).toEqual([3700, 7400, 18700]);
  });

  it("разбивка «Склада» сходится с его ценой за месяц", () => {
    expect(BREAKDOWN.reduce((s, p) => s + p.price, 0)).toBe(plan("warehouse").monthly);
  });
});

describe("калькулятор своего тарифа", () => {
  it("лимиты «Старта» стоят столько же, сколько «Старт»", () => {
    expect(calcMonthly(LIMITS.start)).toBe(plan("start").monthly);
  });

  it("готовые «Склад» и «Оператор» дешевле собранного с теми же лимитами", () => {
    expect(calcMonthly(LIMITS.warehouse)).toBeGreaterThan(plan("warehouse").monthly);
    const op = { ...LIMITS.operator, skus: 100000, sellers: 200 };
    expect(calcMonthly(op)).toBeGreaterThan(plan("operator").monthly);
  });

  it("подсказывает самый дешёвый тариф, в который набранное помещается", () => {
    expect(
      fittingPlan({ warehouses: 1, skus: 10000, staff: 10, sellers: 15, billing: false }),
    ).toBe("warehouse");
    expect(fittingPlan({ warehouses: 1, skus: 1000, staff: 3, sellers: 0, billing: true })).toBe(
      "operator",
    );
    expect(
      fittingPlan({ warehouses: 5, skus: 1000, staff: 3, sellers: 0, billing: false }),
    ).toBeNull();
  });
});
