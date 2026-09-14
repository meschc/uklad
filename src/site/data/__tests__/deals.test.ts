import { describe, expect, test } from "vitest";
import { buildLedger, groupByWarehouse } from "../deals";
import { COMPLAINTS, DEALS, REVIEWS, WAREHOUSES } from "../warehouses";
import { canReview, dealStatus } from "../../lib/reputation";

/**
 * Сделки, отзывы и жалобы витрины.
 *
 * Данные демонстрационные, но правило, на котором они держатся, — настоящее и
 * переедет в базу вместе с ними: у отзыва обязана быть подтверждённая сделка.
 * Стоит генератору однажды выдать отзыв без неё — и витрина начнёт делать ровно
 * то, в чём упрекает рынок: показывать оценки, за которыми ничего не стоит.
 */

const NOW = Date.UTC(2026, 8, 12);
const IDS = ["w-1", "w-2", "w-3", "w-4", "w-5", "w-6", "w-7", "w-8"];

describe("книга сделок", () => {
  test("у каждого отзыва есть своя подтверждённая сделка", () => {
    const byId = new Map(DEALS.map((d) => [d.id, d]));

    for (const review of REVIEWS) {
      const deal = byId.get(review.dealId);
      expect(deal, `отзыв ${review.id} ссылается на несуществующую сделку`).toBeDefined();
      expect(canReview(deal!), `отзыв ${review.id} по неподтверждённой сделке`).toBe(true);
      expect(deal!.warehouseId).toBe(review.warehouseId);
    }
  });

  test("жалоба возможна только по сделке, которую склад принял", () => {
    // Пожаловаться на склад, который заявку даже не взял, нельзя: спора ещё
    // не было. Иначе жалобами закрывают конкурентов, ничего им не отгружая.
    const byId = new Map(DEALS.map((d) => [d.id, d]));

    for (const complaint of COMPLAINTS) {
      const deal = byId.get(complaint.dealId);
      expect(deal, `жалоба ${complaint.id} без сделки`).toBeDefined();
      expect(dealStatus(deal!)).not.toBe("sent");
      expect(dealStatus(deal!)).not.toBe("declined");
    }
  });

  test("оценка в отзыве — от одной до пяти звёзд", () => {
    for (const review of REVIEWS) {
      expect(review.rating).toBeGreaterThanOrEqual(1);
      expect(review.rating).toBeLessThanOrEqual(5);
      expect(Number.isInteger(review.rating)).toBe(true);
    }
  });

  test("ответ склада приходит после жалобы, а не раньше", () => {
    for (const complaint of COMPLAINTS.filter((x) => x.answeredAt !== undefined)) {
      expect(complaint.answeredAt!).toBeGreaterThanOrEqual(complaint.createdAt);
      expect(complaint.answer).toBeDefined();
    }
  });

  test("отметки сделки идут по порядку и не уходят в будущее", () => {
    for (const deal of DEALS) {
      const marks = [deal.acceptedAt, deal.startedAt, deal.sellerConfirmedAt];
      for (const at of marks) if (at !== undefined) expect(at).toBeGreaterThan(deal.createdAt);
    }
  });

  test("один и тот же набор складов даёт один и тот же набор сделок", () => {
    // Витрина пререндерится на сборке: разъехавшийся между двумя запусками
    // генератор означал бы, что в готовом HTML одни отзывы, а в браузере другие.
    const a = buildLedger(IDS, NOW);
    const b = buildLedger(IDS, NOW);
    expect(b).toEqual(a);
  });

  test("сделки склада не зависят от того, сколько складов рядом", () => {
    // Порядковый номер склада в наборе — часть зерна, но соседи на его сделки
    // не влияют: иначе добавление одного склада перетряхнуло бы отзывы всем.
    const whole = groupByWarehouse(buildLedger(IDS, NOW).deals).get(IDS[2]) ?? [];
    const part = groupByWarehouse(buildLedger(IDS.slice(0, 3), NOW).deals).get(IDS[2]) ?? [];
    expect(part).toEqual(whole);
  });

  test("репутация склада собрана из его собственных отзывов", () => {
    const reviews = groupByWarehouse(REVIEWS);

    for (const w of WAREHOUSES) {
      const own = reviews.get(w.id) ?? [];
      expect(w.reputation.reviews).toBe(own.length);
      if (own.length === 0) expect(w.reputation.rating).toBeNull();
      else expect(w.reputation.rating).not.toBeNull();
    }
  });

  test("отзывы есть далеко не у всех — рынок только начинается", () => {
    // Это не мелочь оформления, а то, ради чего числа рейтинга убрали вовсе:
    // склад без истории обязан выглядеть как склад без истории.
    const withReviews = WAREHOUSES.filter((w) => w.reputation.rating !== null).length;
    expect(withReviews).toBeGreaterThan(0);
    expect(withReviews).toBeLessThan(WAREHOUSES.length);
  });
});
