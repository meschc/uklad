import { describe, expect, it } from "vitest";
import { readFeatures, readPlan } from "../planRepository";

describe("readPlan", () => {
  it("берёт тариф, срок и счёт из ответа сервера", () => {
    expect(
      readPlan({
        tariff: "start",
        price: 6900,
        state: "trial",
        trialUntil: "2027-01-18T10:00:00.000Z",
        paidUntil: null,
        invoice: { number: "UK-2026-0001", amount: 6900, dueAt: "2027-01-18T10:00:00.000Z" },
        request: { tariff: "operator", at: "2026-11-18T10:00:00.000Z" },
      }),
    ).toEqual({
      tariff: "start",
      price: 6900,
      state: "trial",
      readOnly: false,
      readOnlyAt: null,
      trialUntil: "2027-01-18T10:00:00.000Z",
      paidUntil: null,
      invoice: { number: "UK-2026-0001", amount: 6900, dueAt: "2027-01-18T10:00:00.000Z" },
      request: { tariff: "operator", at: "2026-11-18T10:00:00.000Z" },
    });
  });

  it("чужая форма — null, а не выдуманный тариф", () => {
    expect(readPlan(null)).toBeNull();
    expect(readPlan({ tariff: "start", state: "free" })).toBeNull();
    expect(readPlan({ state: "paid" })).toBeNull();
  });

  it("договорная цена — null, просьба неизвестного тарифа отбрасывается", () => {
    const p = readPlan({ tariff: "custom", price: null, state: "paid", request: { tariff: "x" } });
    expect(p?.price).toBeNull();
    expect(p?.request).toBeNull();
  });
});

describe("readFeatures", () => {
  it("переводит ключи админки в функции кабинета: ручное включение побеждает тариф", () => {
    const f = readFeatures({
      tariff: "start",
      features: { analytics_full: true, weekly_backup: false, personal_manager: false },
      payment: { readOnly: true },
    });
    expect(f).toEqual({
      tariff: "start",
      features: { fullAnalytics: true, personalManager: false, weeklyEmailBackup: false },
      readOnly: true,
    });
  });

  it("без аккаунта в админке или со своим тарифом — null, остаётся таблица тарифа", () => {
    expect(readFeatures({ features: null })).toBeNull();
    expect(readFeatures({ tariff: "custom", features: {} })).toBeNull();
  });
});
