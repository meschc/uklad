/**
 * Лимиты тарифа на сервере: сколько сотрудников и кабинетов продавцов можно
 * завести. Лимит берётся из админки — тариф аккаунта и ручные правки в
 * карточке («Функции и лимиты», `admin/plans.js` → `effectiveLimits`), а не из
 * браузера: склад не поднимет его себе правкой снимка.
 *
 * Сотрудник — человек с входом или бейджем стола: живой бейдж на карточке
 * сотрудника или участник компании (приглашён, работает, спит), кроме
 * продавцов. Карточка без входа и бейджа в лимит не идёт — это строка в
 * списке, а не рабочее место. Продавец — участник с `partner_ref`.
 *
 * Аккаунта в админке нет (компания не связана) — лимита нет: отказать складу
 * из-за нашей недосвязки хуже, чем не посчитать.
 */
/* global require, module */
/* eslint-disable @typescript-eslint/no-require-imports */
const { adminStore } = require("../admin/store");
const plans = require("../admin/plans");

/** Отсрочка после конца оплаченного или пробного срока: неделя работы как обычно (Кирилл 18.11). */
const GRACE_DAYS = 7;
const DAY_MS = 86_400_000;

/**
 * Что можно писать в неоплаченном кабинете. Столы работают (операции, смена,
 * ответы приёмки), вход и выход, чат с Укладом, просьба о тарифе и всё, что
 * гасит доступ (отозвать бейдж, стол): безопасность от денег не зависит.
 * Остальное — правка кабинета руководителем — ждёт оплаты.
 */
const UNPAID_ALLOWED = [
  /^\/api\/auth\//,
  /^\/api\/desk\//,
  /^\/api\/chat\//,
  /^\/api\/telegram\//,
  /^\/api\/receiving\//,
  /^\/api\/company\/plan\/request$/,
  /^\/api\/cabinet\/switch-requests\/decide$/,
  /^\/api\/cabinet\/badges\/(check|revoke)$/,
  // Открыть стол на устройстве и погасить его: без этого встанет склад.
  /^\/api\/cabinet\/desks(\/revoke)?$/,
  /^\/api\/staff\/badge\/revoke$/,
  /^\/api\/team\/(disable|invite\/revoke)$/,
];

const LIVE = `('invited', 'active', 'sleeping')`;

const COUNT_STAFF = `
  SELECT count(*)::int AS n FROM (
    SELECT b.staff_ref AS k FROM uklad.desk_badges b
     WHERE b.org_id = uklad.current_org() AND b.revoked_at IS NULL
    UNION
    SELECT coalesce(m.staff_ref, m.id::text) FROM uklad.members m
     WHERE m.org_id = uklad.current_org() AND m.deleted_at IS NULL AND m.partner_ref IS NULL
       AND m.status IN ${LIVE}
  ) x`;

const COUNT_SELLERS = `
  SELECT count(*)::int AS n FROM uklad.members m
   WHERE m.org_id = uklad.current_org() AND m.deleted_at IS NULL AND m.partner_ref IS NOT NULL
     AND m.status IN ${LIVE}`;

const COUNTS = { staff: COUNT_STAFF, sellers: COUNT_SELLERS };

/** Отказ «тариф не позволяет»: бросается внутри транзакции, чтобы её откатить. */
class PlanLimitError extends Error {
  constructor(key, limit) {
    super(`plan_limit:${key}`);
    this.key = key;
    this.limit = limit;
  }
}

/**
 * Состояние оплаты для кабинета: `readOnly` — правка кабинета закрыта,
 * `readOnlyAt` — с какого момента (или будет закрыта, пока идёт отсрочка).
 * «Заблокирован» и «В архиве» в админке закрывают сразу. Сроков нет вовсе —
 * не закрываем: это недозаполненная карточка, а не неоплата.
 */
function paymentOf(account, now) {
  if (!account) return { state: null, readOnly: false, readOnlyAt: null };
  const nowIso = now.toISOString();
  const state = plans.billingState(account, nowIso);
  if (state === "blocked" || state === "archived") {
    return { state, readOnly: true, readOnlyAt: null };
  }
  const end = [account.paid_until, account.trial_until].filter(Boolean).sort().pop() ?? null;
  if (!end) return { state, readOnly: false, readOnlyAt: null };
  const at = new Date(Date.parse(end) + GRACE_DAYS * DAY_MS).toISOString();
  return { state, readOnly: state === "overdue" && at <= nowIso, readOnlyAt: at };
}

function createPlanLimits({ db, auth = null, send = null, now = () => new Date() }) {
  const store = adminStore(db);

  /** Лимит компании по ключу (`staff`, `sellers`…); `null` — без ограничения. */
  function limitOf(orgId, key) {
    const a = orgId ? store.accountByOrg(orgId) : null;
    if (!a) return null;
    return plans.effectiveLimits(a)[key]?.value ?? null;
  }

  /**
   * Охрана записи, которая может добавить человека: `const g = await
   * guard(c, orgId, "staff")` ДО записи, `await g.check()` после, в той же
   * транзакции. Блокировка компании берётся до записи и выстраивает
   * параллельные выпуски в очередь: второй посчитает и первого.
   *
   * Отказ — только если запись добавила человека и вышла за лимит. Повторное
   * приглашение на ту же почту и перевыпуск бейджа людей не добавляют: тариф
   * понизили ниже числа людей — потерянный бейдж всё равно перевыпускается,
   * склад не встаёт. Отказ — `PlanLimitError`, транзакция откатывается.
   */
  async function guard(c, orgId, key) {
    const limit = limitOf(orgId, key);
    if (limit == null) return { check: async () => {} };
    await c.query(
      `SELECT pg_advisory_xact_lock(hashtext('uklad.plan_limit:' || uklad.current_org()::text))`,
    );
    const count = async () => (await c.query(COUNTS[key])).rows[0].n;
    const before = await count();
    return {
      check: async () => {
        const after = await count();
        if (after > before && after > limit) throw new PlanLimitError(key, limit);
      },
    };
  }

  const paymentFor = (orgId) => paymentOf(orgId ? store.accountByOrg(orgId) : null, now());

  /**
   * Первое звено цепочки кабинета: запись в неоплаченный кабинет — 402
   * `plan_unpaid`. Чтение, столы и всё из `UNPAID_ALLOWED` идут дальше.
   * Нет сессии или продавец на чужом маршруте — решает сам маршрут.
   */
  async function handle(req, res, url) {
    if (!auth || req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
      return false;
    }
    if (UNPAID_ALLOWED.some((re) => re.test(url.pathname))) return false;
    let orgId = null;
    try {
      orgId = await auth.withSession(req, async (_c, ctx) => ctx.orgId);
    } catch {
      return false;
    }
    if (!orgId || !paymentFor(orgId).readOnly) return false;
    send(res, 402, { ok: false, error: "plan_unpaid" });
    return true;
  }

  return { limitOf, guard, paymentFor, handle };
}

module.exports = { createPlanLimits, PlanLimitError, paymentOf, UNPAID_ALLOWED, GRACE_DAYS };
