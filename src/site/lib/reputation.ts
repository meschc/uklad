import type { Complaint, Deal, Review } from "../data/deals";
import { DAY_MS } from "./date";

/**
 * Репутация склада: свод фактов, а не число из генератора.
 *
 * Раньше у склада было два поля — `rating` и `reviews`, — и оба брались из
 * ГПСЧ. Для демоверсии это выглядело безобидно, но ровно это витрина ставит
 * рынку в укор: оценка, за которой не стоит ни одной сделки. Поэтому чисел у
 * склада больше нет, а есть отзывы, у каждого из которых обязана быть сделка,
 * и жалобы, у которых она тоже обязана быть.
 *
 * Здесь только счёт. Кто вправе оставить отзыв — тоже здесь (`canReview`),
 * потому что это часть того же правила: право на оценку даёт не регистрация,
 * а закрытая и подтверждённая обеими сторонами сделка.
 *
 * Модуль чистый и ничего не знает ни про хранилище, ни про язык витрины: когда
 * за отзывами появится настоящая база, поменяется источник `Review[]`, а счёт
 * останется этим же.
 */

/**
 * Сколько дней у склада есть на публичный ответ.
 *
 * Через этот срок жалоба считается подтверждённой — не потому, что кто-то
 * разобрал спор, а потому, что склад не стал отвечать. Разбирать спор об
 * упаковке платформе физически нечем: мы не видели ни коробки, ни товара.
 * Единственное, что мы видим достоверно, — ответил склад или промолчал.
 */
export const COMPLAINT_ANSWER_DAYS = 14;

/** За какой срок считаются подтверждённые жалобы для автопонижения. */
export const COMPLAINT_PERIOD_DAYS = 90;

/**
 * Сколько подтверждённых жалоб за период убирают склад из топа выдачи.
 *
 * Две, а не одна: одна жалоба без ответа бывает и у честного склада — человек
 * ушёл в отпуск, письмо попало в спам. Две за квартал — это уже поведение.
 */
export const DEMOTION_THRESHOLD = 2;

export interface Reputation {
  /** Средняя оценка по отзывам, один знак после запятой. `null` — отзывов нет. */
  rating: number | null;
  /** Сколько отзывов за ней стоит. */
  reviews: number;
  /** Жалобы без публичного ответа склада — то, что видно на карточке. */
  openComplaints: number;
  /** Из них те, на которые склад не ответил в срок, за последний период. */
  confirmedComplaints: number;
  /** Склад уходит из топа выдачи. */
  demoted: boolean;
}

/** Пустая репутация — у склада, с которым через Уклад ещё никто не работал. */
export const NO_REPUTATION: Reputation = {
  rating: null,
  reviews: 0,
  openComplaints: 0,
  confirmedComplaints: 0,
  demoted: false,
};

/**
 * Путь заявки-подбора с витрины.
 *
 * Это не заявка на отгрузку внутри склада (`FulfillmentRequest` в кабинете) —
 * та появляется позже и живёт в WMS. Здесь стадии рынка: селлер написал, склад
 * согласился, поставка реально доехала, обе стороны это подтвердили. Право на
 * отзыв открывает только последняя.
 */
export type DealStatus = "sent" | "accepted" | "started" | "confirmed" | "declined" | "cancelled";

/**
 * Стадия сделки по её отметкам времени.
 *
 * Стадия не хранится отдельным полем намеренно: хранятся факты («склад ответил
 * тогда-то»), а стадия из них выводится. Иначе поле и отметки разъезжаются на
 * первом же сбое, и приходится решать, чему верить. Заодно это ровно та форма,
 * которую примет строка в базе: колонки с датами и вычисляемый статус.
 */
export function dealStatus(deal: Deal): DealStatus {
  // Тупики проверяются первыми: отказ и отзыв заявки перечёркивают всё, что
  // было до них, и вернуться из них нельзя.
  if (deal.cancelledAt) return "cancelled";
  if (deal.declinedAt) return "declined";
  if (deal.sellerConfirmedAt && deal.warehouseConfirmedAt) return "confirmed";
  if (deal.startedAt) return "started";
  if (deal.acceptedAt) return "accepted";
  return "sent";
}

/**
 * Вправе ли селлер оставить отзыв по этой сделке.
 *
 * Подтверждения нужны оба. Одного мало в обе стороны: селлер, подтвердивший
 * сделку в одиночку, — это отзыв о складе, который его в глаза не видел;
 * склад, подтвердивший в одиночку, — это отзыв, который склад заказал себе сам.
 */
export function canReview(deal: Deal): boolean {
  return dealStatus(deal) === "confirmed";
}

/** Жалоба ждёт публичного ответа. */
export function isComplaintOpen(complaint: Complaint): boolean {
  return complaint.answeredAt === undefined;
}

/** Жалоба без ответа дольше отведённого срока. */
export function isComplaintConfirmed(complaint: Complaint, now: number): boolean {
  return isComplaintOpen(complaint) && now - complaint.createdAt > COMPLAINT_ANSWER_DAYS * DAY_MS;
}

/**
 * Свести отзывы и жалобы одного склада в то, что показывает витрина.
 *
 * `now` приходит параметром, а не берётся из часов внутри: от него зависит и
 * подтверждение жалобы, и период автопонижения, и тест на такую функцию без
 * этого пришлось бы писать через подмену системного времени.
 */
export function buildReputation(
  reviews: readonly Review[],
  complaints: readonly Complaint[],
  now: number,
): Reputation {
  const rating = reviews.length
    ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10
    : null;

  const openComplaints = complaints.filter(isComplaintOpen).length;
  const confirmedComplaints = complaints.filter(
    (x) => isComplaintConfirmed(x, now) && now - x.createdAt <= COMPLAINT_PERIOD_DAYS * DAY_MS,
  ).length;

  return {
    rating,
    reviews: reviews.length,
    openComplaints,
    confirmedComplaints,
    demoted: confirmedComplaints >= DEMOTION_THRESHOLD,
  };
}
