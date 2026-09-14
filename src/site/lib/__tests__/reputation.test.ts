import { describe, expect, test } from "vitest";
import type { Complaint, Deal, Review } from "../../data/deals";
import {
  COMPLAINT_ANSWER_DAYS,
  COMPLAINT_PERIOD_DAYS,
  DEMOTION_THRESHOLD,
  buildReputation,
  canReview,
  dealStatus,
  isComplaintConfirmed,
  isComplaintOpen,
} from "../reputation";

/**
 * Правила репутации.
 *
 * Проверяем не арифметику среднего, а обещания, которые витрина даёт вслух:
 * отзыв — только по сделке, подтверждённой обеими сторонами; жалоба
 * подтверждается молчанием склада, а не чьим-то решением; из топа выдачи
 * убирают по счёту, а не по усмотрению. Каждое из них однажды придётся
 * объяснять складу, который с понижением не согласен, — и объяснением будет
 * этот файл.
 */

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 12);

const deal = (patch: Partial<Deal> = {}): Deal => ({
  id: "w-1-d1",
  warehouseId: "w-1",
  sellerId: "s-1",
  createdAt: NOW - 60 * DAY,
  ...patch,
});

const review = (rating: number): Review => ({
  id: `w-1-r${rating}`,
  dealId: "w-1-d1",
  warehouseId: "w-1",
  authorId: "s-1",
  rating,
  text: { ru: "", en: "" },
  createdAt: NOW - 30 * DAY,
});

const complaint = (patch: Partial<Complaint> = {}): Complaint => ({
  id: "w-1-c1",
  dealId: "w-1-d1",
  warehouseId: "w-1",
  authorId: "s-1",
  text: { ru: "", en: "" },
  createdAt: NOW - 30 * DAY,
  ...patch,
});

describe("стадия сделки", () => {
  test("новая заявка — просто отправлена", () => {
    expect(dealStatus(deal())).toBe("sent");
  });

  test("подтверждение обеими сторонами доводит сделку до состоявшейся", () => {
    const done = deal({
      acceptedAt: NOW - 50 * DAY,
      startedAt: NOW - 40 * DAY,
      sellerConfirmedAt: NOW - 30 * DAY,
      warehouseConfirmedAt: NOW - 30 * DAY,
    });
    expect(dealStatus(done)).toBe("confirmed");
  });

  test("одного подтверждения мало — сделка остаётся начатой", () => {
    // Отзыв по сделке, которую подтвердила одна сторона, — это либо отзыв о
    // складе, который селлера не видел, либо отзыв, который склад заказал себе
    // сам. Ни то ни другое на витрину не попадает.
    const half = deal({ startedAt: NOW - 40 * DAY, sellerConfirmedAt: NOW - 30 * DAY });
    expect(dealStatus(half)).toBe("started");
    expect(canReview(half)).toBe(false);
  });

  test("отказ и отмена перечёркивают всё, что было до них", () => {
    const base = {
      acceptedAt: NOW - 50 * DAY,
      startedAt: NOW - 40 * DAY,
      sellerConfirmedAt: NOW - 30 * DAY,
      warehouseConfirmedAt: NOW - 30 * DAY,
    };
    expect(dealStatus(deal({ ...base, declinedAt: NOW - 20 * DAY }))).toBe("declined");
    expect(dealStatus(deal({ ...base, cancelledAt: NOW - 20 * DAY }))).toBe("cancelled");
  });

  test("право на отзыв даёт только подтверждённая сделка", () => {
    expect(canReview(deal())).toBe(false);
    expect(canReview(deal({ acceptedAt: NOW - 50 * DAY }))).toBe(false);
    expect(
      canReview(deal({ sellerConfirmedAt: NOW - 30 * DAY, warehouseConfirmedAt: NOW - 29 * DAY })),
    ).toBe(true);
  });
});

describe("жалоба", () => {
  test("открыта, пока склад не ответил публично", () => {
    expect(isComplaintOpen(complaint())).toBe(true);
    expect(isComplaintOpen(complaint({ answeredAt: NOW - 20 * DAY }))).toBe(false);
  });

  test("подтверждается молчанием дольше срока, а не чьим-то решением", () => {
    const fresh = complaint({ createdAt: NOW - (COMPLAINT_ANSWER_DAYS - 1) * DAY });
    const stale = complaint({ createdAt: NOW - (COMPLAINT_ANSWER_DAYS + 1) * DAY });

    expect(isComplaintConfirmed(fresh, NOW)).toBe(false);
    expect(isComplaintConfirmed(stale, NOW)).toBe(true);
  });

  test("ответ в срок закрывает жалобу навсегда", () => {
    // Ответивший склад не наказывается задним числом: иначе выгодно молчать и
    // ждать, пока жалоба «устареет», а не разбираться с ней.
    const answered = complaint({
      createdAt: NOW - 300 * DAY,
      answer: { ru: "", en: "" },
      answeredAt: NOW - 295 * DAY,
    });
    expect(isComplaintConfirmed(answered, NOW)).toBe(false);
  });
});

describe("сводная репутация", () => {
  test("без отзывов оценки нет, а не ноль", () => {
    const empty = buildReputation([], [], NOW);
    expect(empty.rating).toBeNull();
    expect(empty.reviews).toBe(0);
  });

  test("оценка — среднее по отзывам с одним знаком", () => {
    expect(buildReputation([review(5), review(4), review(4)], [], NOW).rating).toBe(4.3);
  });

  test("порог подтверждённых жалоб убирает склад из топа", () => {
    const old = (n: number) => complaint({ id: `c${n}`, createdAt: NOW - 30 * DAY });
    const many = Array.from({ length: DEMOTION_THRESHOLD }, (_, i) => old(i));

    expect(buildReputation([], many.slice(0, DEMOTION_THRESHOLD - 1), NOW).demoted).toBe(false);
    expect(buildReputation([], many, NOW).demoted).toBe(true);
  });

  test("жалобы старше периода в понижении не участвуют", () => {
    // Иначе склад, исправившийся два года назад, остаётся внизу выдачи
    // навсегда — а понижение задумано как повод ответить, а не как клеймо.
    const ancient = Array.from({ length: DEMOTION_THRESHOLD }, (_, i) =>
      complaint({ id: `c${i}`, createdAt: NOW - (COMPLAINT_PERIOD_DAYS + 10) * DAY }),
    );
    const reputation = buildReputation([], ancient, NOW);

    expect(reputation.confirmedComplaints).toBe(0);
    expect(reputation.demoted).toBe(false);
    // Но открытыми они быть не перестают: склад так и не ответил.
    expect(reputation.openComplaints).toBe(DEMOTION_THRESHOLD);
  });
});
