import { c, type Copy } from "../lib/copy";
import { DAY_MS } from "../lib/date";
import { int, pick, rng } from "../lib/rng";
import { COMPLAINT_ANSWER_DAYS, type DealStatus } from "../lib/reputation";

/**
 * Сделки витрины, отзывы и жалобы.
 *
 * Зачем отдельная сущность. У склада на витрине было два поля из генератора —
 * оценка и число отзывов, — и за ними не стояло ничего. Отзыв, который можно
 * оставить, не имея со складом дела, — ровно то, в чём витрина упрекает рынок;
 * оценка, выведенная неизвестно из чего, — то же самое одним числом. Поэтому
 * здесь сначала сделка, потом отзыв со ссылкой на неё, и только потом — цифра
 * на карточке (её считает `lib/reputation`).
 *
 * Сделка здесь — заявка-подбор с витрины, а не заявка на отгрузку внутри склада
 * (`FulfillmentRequest` в кабинете). Это разные вещи и по времени, и по смыслу:
 * витринная сделка начинается до того, как склад вообще выбран, и кончается
 * тем, что обе стороны подтвердили работу друг с другом. Заявки на отгрузку
 * начинаются после и живут в WMS. Где сделка встречается с кабинетом — в
 * `docs/adr/0005-styk-vitriny-i-kabineta.md`: единственная точка стыка —
 * ожидаемая поставка, и «готов принять» в кабинете не заводит ничего.
 *
 * Данные, как и склады, сгенерированы и детерминированы. Зерно у набора своё:
 * бросать общий ГПСЧ складов здесь нельзя — сдвинулась бы вся их
 * последовательность, и витрина пересобралась бы с другими именами и ценами,
 * а ссылки на склады уже разосланы.
 */

const HOUR_MS = 3_600_000;

/** Собственное зерно набора сделок — не пересекается с зерном складов. */
const DEALS_SEED = 20260912;

/** Шаг зерна между складами: у каждого своя независимая история. */
const SEED_STEP = 7919;

export interface Deal {
  id: string;
  warehouseId: string;
  /** Кто искал склад. Идентификатор, а не имя: людей мы не выдумываем. */
  sellerId: string;
  createdAt: number;
  /** Склад согласился принять товар. */
  acceptedAt?: number;
  /** Склад отказал — тупик, отзыва отсюда не будет. */
  declinedAt?: number;
  /** Селлер отозвал заявку — второй тупик. */
  cancelledAt?: number;
  /** Первая поставка доехала: сделка состоялась. */
  startedAt?: number;
  /** Подтверждение селлера, что работа была. */
  sellerConfirmedAt?: number;
  /** Подтверждение склада — второе и обязательное (см. `canReview`). */
  warehouseConfirmedAt?: number;
}

export interface Review {
  id: string;
  /** Сделка, без которой отзыва не бывает. Обязательное поле, не «по желанию». */
  dealId: string;
  warehouseId: string;
  authorId: string;
  /** Оценка 1…5 целыми: половинок в отзыве человек не ставит. */
  rating: number;
  text: Copy;
  createdAt: number;
}

export interface Complaint {
  id: string;
  dealId: string;
  warehouseId: string;
  authorId: string;
  text: Copy;
  createdAt: number;
  /** Публичный ответ склада. Пока его нет — жалоба открыта. */
  answer?: Copy;
  answeredAt?: number;
}

/** Всё, что витрина знает о работе складов с селлерами. */
export interface Ledger {
  deals: Deal[];
  reviews: Review[];
  complaints: Complaint[];
}

/**
 * Как сделки распределены по стадиям и насколько они стары.
 *
 * Возраст привязан к стадии, а не брошен отдельно: «заявка отправлена» с
 * прошлого года — это не стадия, а брошенный склад, и на витрине такая запись
 * читалась бы как поломка. Доли подобраны под молодой рынок: подтверждённых
 * сделок меньше половины, отказы — обычное дело.
 */
const STAGES: { status: DealStatus; share: number; minAgeDays: number; maxAgeDays: number }[] = [
  { status: "confirmed", share: 0.32, minAgeDays: 30, maxAgeDays: 540 },
  { status: "started", share: 0.18, minAgeDays: 20, maxAgeDays: 300 },
  { status: "accepted", share: 0.12, minAgeDays: 3, maxAgeDays: 40 },
  { status: "sent", share: 0.1, minAgeDays: 0, maxAgeDays: 9 },
  { status: "declined", share: 0.18, minAgeDays: 2, maxAgeDays: 200 },
  { status: "cancelled", share: 0.1, minAgeDays: 2, maxAgeDays: 200 },
];

/** Сколько сделок бывает у склада за всё время работы витрины. */
const MAX_DEALS = 9;

/** Доля складов, у которых жалобы идут одна за другой. */
const TROUBLED_SHARE = 0.07;
/** Сколько сделок заводим проблемному складу — иначе жаловаться не на что. */
const TROUBLED_MIN_DEALS = 4;
/** Сколько сделок подряд у него кончаются жалобой. */
const TROUBLED_COMPLAINT_SHARE = 0.8;
/** И как редко он на них отвечает. */
const TROUBLED_ANSWER_SHARE = 0.25;

/** Доля подтверждённых сделок, по которым селлер вообще написал отзыв. */
const REVIEW_SHARE = 0.62;
/** Доля сделок обычного склада, дошедших до жалобы. */
const COMPLAINT_SHARE = 0.05;
/** Как часто обычный склад отвечает на жалобу публично. */
const ANSWER_SHARE = 0.7;

const PRAISE: Copy[] = [
  c(
    "Приняли машину в день привоза, расхождений по количеству не было",
    "Took the truck the day it arrived, no discrepancies in the count",
  ),
  c(
    "Отвечают в переписке в тот же час, а не через сутки",
    "They answer within the hour, not the next day",
  ),
  c(
    "Собирают аккуратно: за полгода два возврата по упаковке",
    "Careful picking: two packaging returns in six months",
  ),
  c(
    "Цену после подписания договора не меняли",
    "The price did not change after the contract was signed",
  ),
  c(
    "Остатки видно в кабинете, звонить и уточнять не приходится",
    "Stock is visible in the dashboard, no need to call and ask",
  ),
  c(
    "Взяли партию в двадцать мест и не навязали минимальный объём",
    "Took a twenty-slot batch without pushing a minimum",
  ),
  c(
    "Маркировку сделали сами, отчёт прислали без напоминания",
    "They handled the labelling and sent the report unprompted",
  ),
  c(
    "Перед новогодним пиком не сорвали ни одной отгрузки",
    "Not a single shipment missed before the New Year peak",
  ),
];

const GRIPE: Copy[] = [
  c(
    "Приёмка заняла четыре дня вместо обещанных суток",
    "Intake took four days instead of the promised one",
  ),
  c(
    "Пересорт в двух заказах подряд, разбирались неделю",
    "Wrong items in two orders running, a week to sort out",
  ),
  c(
    "В счёте появились услуги, о которых не договаривались",
    "The invoice grew services we had never agreed on",
  ),
  c(
    "На письма отвечают через раз, дозвониться удалось не сразу",
    "Replies come every other time, getting through by phone took a while",
  ),
  c("Часть коробов приехала на маркетплейс мятой", "Some boxes reached the marketplace dented"),
];

const COMPLAINTS_TEXT: Copy[] = [
  c(
    "Товар лежит третью неделю, отгрузки нет и сроков не называют",
    "Goods have sat for three weeks, no shipment and no dates",
  ),
  c("Потеряли паллету, на запросы не отвечают", "A pallet went missing, requests go unanswered"),
  c(
    "Выставили счёт за хранение после того, как всё вывезли",
    "Billed for storage after everything had been taken away",
  ),
  c(
    "Отказались отдавать товар до оплаты спорной услуги",
    "Refused to release the goods until a disputed service was paid",
  ),
];

const ANSWERS: Copy[] = [
  c(
    "Машина стояла в очереди на рампе, товар отгружен 14-го, накладную приложили",
    "The truck was queued at the ramp, goods shipped on the 14th, waybill attached",
  ),
  c(
    "Паллета нашлась в зоне возвратов, вернули, хранение за месяц не выставляли",
    "The pallet turned up in returns, sent back, no storage billed for the month",
  ),
  c("Счёт выставлен ошибочно, аннулировали", "The invoice was issued in error and is cancelled"),
];

/** Отметка не может оказаться в будущем: сделка не могла закрыться завтра. */
const stamp = (at: number, now: number): number => Math.min(at, now);

/** Стадия по накопленным долям. Один бросок, порядок как в `STAGES`. */
function pickStage(r: () => number): (typeof STAGES)[number] {
  const x = r();
  let acc = 0;
  for (const stage of STAGES) {
    acc += stage.share;
    if (x < acc) return stage;
  }
  return STAGES[STAGES.length - 1];
}

/** Сделка нужной стадии: заполняем ровно те отметки, что до неё дошли. */
function buildDeal(
  id: string,
  warehouseId: string,
  stage: (typeof STAGES)[number],
  now: number,
  r: () => number,
): Deal {
  const createdAt = now - int(r, stage.minAgeDays, stage.maxAgeDays) * DAY_MS;
  const deal: Deal = { id, warehouseId, sellerId: `s-${int(r, 100, 999)}`, createdAt };

  if (stage.status === "sent") return deal;
  if (stage.status === "cancelled") {
    return { ...deal, cancelledAt: stamp(createdAt + int(r, 1, 10) * DAY_MS, now) };
  }

  const answeredAt = stamp(createdAt + int(r, 1, 72) * HOUR_MS, now);
  if (stage.status === "declined") return { ...deal, declinedAt: answeredAt };

  const accepted = { ...deal, acceptedAt: answeredAt };
  if (stage.status === "accepted") return accepted;

  const started = { ...accepted, startedAt: stamp(answeredAt + int(r, 3, 21) * DAY_MS, now) };
  if (stage.status === "started") return started;

  // Подтверждения идут врозь: первым обычно подтверждает тот, кому это нужнее.
  const sellerConfirmedAt = stamp(started.startedAt + int(r, 2, 30) * DAY_MS, now);
  return {
    ...started,
    sellerConfirmedAt,
    warehouseConfirmedAt: stamp(sellerConfirmedAt + int(r, 1, 14) * DAY_MS, now),
  };
}

/** Оценка: хороших отзывов больше, но не все — иначе это снова не факт, а фон. */
function pickRating(r: () => number): number {
  const x = r();
  if (x < 0.55) return 5;
  if (x < 0.85) return 4;
  if (x < 0.95) return 3;
  return int(r, 1, 2);
}

/**
 * История одного склада: сделки, отзывы по подтверждённым из них и жалобы.
 *
 * Пишем в общий `Ledger`, а не возвращаем три списка: связь у записей сквозная
 * (отзыв ссылается на сделку), и собирать их в разных местах значило бы
 * разрешить существование отзыва без сделки — того самого, против чего всё это.
 */
function buildForWarehouse(warehouseId: string, index: number, now: number, out: Ledger): void {
  const r = rng(DEALS_SEED + index * SEED_STEP);
  const troubled = r() < TROUBLED_SHARE;
  const count = troubled ? int(r, TROUBLED_MIN_DEALS, MAX_DEALS + 1) : int(r, 0, MAX_DEALS);
  const complaintShare = troubled ? TROUBLED_COMPLAINT_SHARE : COMPLAINT_SHARE;
  const answerShare = troubled ? TROUBLED_ANSWER_SHARE : ANSWER_SHARE;

  for (let i = 0; i < count; i++) {
    const stage = pickStage(r);
    const deal = buildDeal(`${warehouseId}-d${i + 1}`, warehouseId, stage, now, r);
    out.deals.push(deal);

    if (stage.status === "confirmed" && r() < REVIEW_SHARE) {
      const rating = pickRating(r);
      out.reviews.push({
        id: `${warehouseId}-r${i + 1}`,
        dealId: deal.id,
        warehouseId,
        authorId: deal.sellerId,
        rating,
        text: pick(rating >= 4 ? PRAISE : GRIPE, r),
        // Отзыв пишут по горячим следам подтверждения, а не когда-нибудь потом.
        createdAt: stamp(deal.warehouseConfirmedAt! + int(r, 0, 9) * DAY_MS, now),
      });
    }

    // Жаловаться есть на что с того момента, как склад согласился: потерянная
    // паллета и сорванные сроки случаются задолго до подтверждения сделки.
    const canComplain = deal.acceptedAt !== undefined && deal.declinedAt === undefined;
    if (!canComplain || r() >= complaintShare) continue;

    const createdAt = stamp(deal.acceptedAt! + int(r, 5, 60) * DAY_MS, now);
    const answered = r() < answerShare;
    out.complaints.push({
      id: `${warehouseId}-c${i + 1}`,
      dealId: deal.id,
      warehouseId,
      authorId: deal.sellerId,
      text: pick(COMPLAINTS_TEXT, r),
      createdAt,
      ...(answered
        ? {
            answer: pick(ANSWERS, r),
            // Ответ в срок — тот, что успел до окончания окна: именно молчание
            // дольше него делает жалобу подтверждённой (см. `reputation`).
            answeredAt: stamp(createdAt + int(r, 1, COMPLAINT_ANSWER_DAYS - 2) * DAY_MS, now),
          }
        : {}),
    });
  }
}

/**
 * Собрать историю всей витрины.
 *
 * Список складов приходит параметром, а не импортом: иначе получился бы круг —
 * складу нужна репутация, репутации нужны отзывы, отзывам нужен склад. Здесь
 * модуль ничего не знает о складах, кроме их идентификаторов.
 */
export function buildLedger(warehouseIds: readonly string[], now: number): Ledger {
  const out: Ledger = { deals: [], reviews: [], complaints: [] };
  warehouseIds.forEach((id, index) => buildForWarehouse(id, index, now, out));
  return out;
}

/** Разложить записи по складам — витрина всегда спрашивает про один склад. */
export function groupByWarehouse<T extends { warehouseId: string }>(
  items: readonly T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const list = map.get(item.warehouseId);
    if (list) list.push(item);
    else map.set(item.warehouseId, [item]);
  }
  return map;
}
