/**
 * Тариф компании глазами кабинета: что назначено, до какого числа, какой счёт
 * ждёт оплаты — и заявка на другой тариф.
 *
 * Тариф назначает только Уклад, в админке (`admin/routes.js`, «Тариф и
 * сроки»). Кабинет его не переключает: раньше плитки тарифа меняли поле в
 * браузере, а сервер и счёт об этом не знали (Кирилл 18.11 — блокер запуска).
 * Теперь склад видит назначенное и может только попросить другой тариф:
 * просьба ложится в карточку аккаунта и уходит письмом владельцу Уклада.
 *
 * Аккаунт админки (SQLite) связан с компанией кабинета (Postgres) полем
 * `org_id`: его пишет регистрация. Аккаунты, заведённые до связки, находятся
 * по почте вошедшего владельца и связываются при первом запросе.
 *
 * Маршруты (право `org.manage` — «Компания: настройки, оплата, удаление»):
 *   GET  /api/company/plan          — { ok, plan } или { ok, plan: null }
 *   POST /api/company/plan/request  — { tariff } → { ok, plan }
 */
/* global require, module, process, console */
/* eslint-disable @typescript-eslint/no-require-imports */
const { adminStore } = require("../admin/store");
const plans = require("../admin/plans");

/** Тарифы, которые склад может попросить сам. Свой и корпоративный — разговором. */
const REQUESTABLE = ["start", "warehouse", "operator"];
/** Роль создателя компании (`auth.register`, миграция 004). */
const OWNER_ROLE = "Владелец";
/** Письмо о просьбе — не чаще раза в час на аккаунт: чередованием тарифов почту не завалить. */
const LETTER_EVERY_MS = 3_600_000;

/** Что кабинет показывает о тарифе. Цена — своя у аккаунта (спеццена) или тарифа. */
function planView(a, invoice, nowIso) {
  return {
    tariff: a.tariff,
    price: a.price ?? plans.PLANS[a.tariff]?.price ?? null,
    period: a.period,
    state: plans.billingState(a, nowIso),
    trialUntil: a.trial_until ?? null,
    paidUntil: a.paid_until ?? null,
    invoice: invoice
      ? { number: invoice.number, amount: invoice.amount, dueAt: invoice.due_at }
      : null,
    request: a.tariff_request ? { tariff: a.tariff_request, at: a.tariff_request_at } : null,
  };
}

function requestLetter(a, tariff) {
  const from = plans.PLANS[a.tariff]?.title ?? a.tariff;
  const to = plans.PLANS[tariff].title;
  return {
    subject: `${a.name}: просит тариф «${to}»`,
    text: [
      `${a.name} (${a.email}) просит перейти с «${from}» на «${to}».`,
      ``,
      `Тариф меняется в админке: «Пользователи» → аккаунт #${a.id} → «Тариф и сроки».`,
      `После сохранения просьба гаснет, кабинет склада покажет новый тариф.`,
    ].join("\n"),
  };
}

function createPlan({
  auth,
  db,
  send,
  mail = null,
  mailTo = process.env.MAIL_TO,
  now = () => new Date(),
  log = console,
}) {
  const { withSession, readJson, tokenHash, tx } = auth;
  const store = adminStore(db);
  // Таблицу счетов заводит `admin/invoices.js` — позже нас и только с
  // включённой админкой. Поэтому запрос готовится при первом обращении.
  let openInvoice = null;
  const invoiceOf = (accountId) => {
    if (!openInvoice) {
      if (!db.prepare(`SELECT 1 FROM sqlite_master WHERE name = 'invoices'`).get()) return null;
      openInvoice = db.prepare(
        `SELECT * FROM invoices WHERE account_id = ? AND status = 'issued' LIMIT 1`,
      );
    }
    return openInvoice.get(accountId) ?? null;
  };

  /**
   * Связать старый аккаунт админки (без `org_id`) с компанией по почте.
   * Только если вошедший — «Владелец» ровно одной компании, и это она: иначе
   * владелец склада А, позванный в компанию Б, привязал бы свой аккаунт к Б и
   * показал бы ей свой тариф и счёт (ревью безопасности #193). Остальное
   * связывается вручную в админке. Свой запрос к базе, вне транзакции сессии:
   * `my_orgs` переставляет контекст входа.
   */
  async function linkByEmail(orgId, hash) {
    const { me, orgs } = await tx(async (c) => ({
      me: (await c.query(`SELECT email FROM auth.my_account($1)`, [hash])).rows[0],
      orgs: (await c.query(`SELECT org_id, role_name FROM auth.my_orgs($1)`, [hash])).rows,
    }));
    if (orgs.length !== 1 || orgs[0].org_id !== orgId || orgs[0].role_name !== OWNER_ROLE) {
      return null;
    }
    const byEmail = me?.email ? store.accountByEmail(me.email) : null;
    // Только склад и только ещё не связанный: чужую связку почтой не перебить.
    if (!byEmail || byEmail.kind !== "warehouse" || byEmail.org_id) return null;
    store.updateAccount(byEmail.id, { org_id: orgId }, now());
    store.log(now(), null, "account_link", `account:${byEmail.id}`, { компания: orgId });
    return store.account(byEmail.id);
  }

  /** `fn(account)` от имени владельца; статус ошибки — числом. */
  async function asOwner(req, fn) {
    const hash = tokenHash(req);
    const out = await withSession(req, async (_c, ctx) => {
      if (!ctx.accountId || !ctx.can("org.manage")) return { status: 403 };
      return { orgId: ctx.orgId };
    });
    if (!out) return { status: 401 };
    if (out.status) return out;
    const account = store.accountByOrg(out.orgId) ?? (await linkByEmail(out.orgId, hash));
    return fn(account);
  }

  const view = (a) => planView(a, invoiceOf(a.id), now().toISOString());

  async function get(req, res) {
    const out = await asOwner(req, (a) => ({ plan: a ? view(a) : null }));
    if (out.status) return send(res, out.status, { ok: false });
    return send(res, 200, { ok: true, plan: out.plan });
  }

  async function request(req, res) {
    const b = await readJson(req, res);
    if (!b) return;
    const tariff = String(b.tariff ?? "");
    if (!REQUESTABLE.includes(tariff)) return send(res, 400, { ok: false, error: "bad_tariff" });
    const out = await asOwner(req, async (a) => {
      if (!a) return { status: 404 };
      if (a.tariff === tariff) return { status: 409 };
      // Та же просьба второй раз письма не шлёт: владелец Уклада её уже видел.
      if (a.tariff_request === tariff) return { plan: view(a) };
      const t = now();
      const lastAt = a.tariff_request_at ? Date.parse(a.tariff_request_at) : 0;
      const letter = !(t.getTime() - lastAt < LETTER_EVERY_MS);
      store.updateAccount(a.id, { tariff_request: tariff, tariff_request_at: t.toISOString() }, t);
      store.log(t, null, "account_tariff_request", `account:${a.id}`, {
        было: a.tariff,
        просит: tariff,
      });
      if (letter && mail && mailTo) {
        mail
          .sendTo({ to: mailTo, ...requestLetter(a, tariff) })
          .catch((e) => log.error?.(`[uklad] письмо о смене тарифа не ушло: ${e.message}`));
      }
      return { plan: view(store.account(a.id)) };
    });
    if (out.status) return send(res, out.status, { ok: false });
    return send(res, 200, { ok: true, plan: out.plan });
  }

  const routes = {
    "GET /api/company/plan": get,
    "POST /api/company/plan/request": request,
  };

  /** Обработчик маршрутов. `false` — маршрут не наш. */
  async function handle(req, res, url) {
    const route = routes[`${req.method} ${url.pathname}`];
    if (!route) return false;
    try {
      await route(req, res);
    } catch (err) {
      log.error?.("[uklad] тариф:", err.message);
      if (!res.headersSent) send(res, 500, { ok: false });
    }
    return true;
  }

  return { handle };
}

module.exports = { createPlan, planView, REQUESTABLE };
