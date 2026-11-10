/**
 * Счета складам за тариф: выставить, отправить, засчитать оплату.
 *
 * Деньги приходят переводом на счёт самозанятого. Банк не сообщает нам о
 * переводе (API есть только у счетов ИП и ООО), поэтому оплату засчитывает
 * владелец в админке одним нажатием: находит счёт по номеру или сумме из
 * выписки и жмёт «Оплачено». Всё остальное — само:
 *
 *  - за 7 дней до конца оплаченного или пробного срока выставляется счёт на
 *    период тарифа (месяц, полгода, год) и уходит письмом на почту аккаунта;
 *  - у аккаунта не больше одного открытого счёта (уникальный индекс): повторный
 *    обход ничего не выставит, пока тот не оплачен или не отменён;
 *  - «Оплачено» продлевает «оплачено до» и пишет оплату в `payments` в одной
 *    транзакции; второе нажатие на тот же счёт ничего не продлевает.
 *
 * Счета только складам: кабинет продавца входит в тариф склада.
 * Реквизиты получателя — из окружения сервера (`PAYEE_*`): без них счёт не
 * выставляется, а не уходит с пустыми реквизитами.
 */
/* global require, module, console */
/* eslint-disable @typescript-eslint/no-require-imports */
const plans = require("./plans");

const DAY = 86_400_000;
const ISSUE_BEFORE_DAYS = 7;
const PERIOD_MONTHS = { month: 1, half: 6, year: 12 };
const STATUS_TITLES = { issued: "Ждёт оплаты", paid: "Оплачен", cancelled: "Отменён" };

const PAYEE_ENV = {
  name: "PAYEE_NAME",
  inn: "PAYEE_INN",
  bank: "PAYEE_BANK",
  bik: "PAYEE_BIK",
  account: "PAYEE_ACCOUNT",
  corr: "PAYEE_CORR_ACCOUNT",
};

/** Реквизиты из окружения; `null`, если хоть одного нет. */
function readPayee(env) {
  const out = {};
  for (const [key, name] of Object.entries(PAYEE_ENV)) {
    const v = (env[name] ?? "").trim();
    if (!v) return null;
    out[key] = v;
  }
  return out;
}

/** Цена в месяц: своя у аккаунта, иначе из тарифа; `null` — договорная. */
function monthlyPrice(a) {
  return a.price ?? plans.PLANS[a.tariff]?.price ?? null;
}

/** До какого числа у аккаунта всё оплачено или идёт пробный. */
function coveredUntil(a) {
  return [a.paid_until, a.trial_until].filter(Boolean).sort().pop() ?? null;
}

const rub = (n) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ₽`;
const day = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "—");

function letter(inv, a, payee) {
  const purpose = `Оплата по счёту № ${inv.number} за доступ к сервису Уклад, тариф «${
    plans.PLANS[a.tariff]?.title ?? a.tariff
  }», ${inv.months} мес. Без НДС.`;
  return {
    subject: `Счёт № ${inv.number} на оплату Уклада`,
    text: [
      `Здравствуйте!`,
      ``,
      `Выставили счёт № ${inv.number} от ${day(inv.issued_at)} на ${rub(inv.amount)}.`,
      `Оплатите до ${day(inv.due_at)}, чтобы кабинет работал без перерыва.`,
      ``,
      `Получатель: ${payee.name}, плательщик НПД`,
      `ИНН: ${payee.inn}`,
      `Счёт: ${payee.account}`,
      `Банк: ${payee.bank}`,
      `БИК: ${payee.bik}`,
      `Корр. счёт: ${payee.corr}`,
      `Сумма: ${rub(inv.amount)}`,
      `Назначение платежа: ${purpose}`,
      ``,
      `Номер счёта в назначении обязателен: по нему мы засчитываем оплату.`,
      `Чек НПД пришлём на эту почту после поступления денег.`,
      ``,
      `Уклад`,
    ].join("\n"),
  };
}

/** node:sqlite не умеет транзакций сам: BEGIN IMMEDIATE … COMMIT, при ошибке — ROLLBACK. */
function inTx(db, fn) {
  return (...args) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const out = fn(...args);
      db.exec("COMMIT");
      return out;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  };
}

function createInvoices({ db, payee = null, send = null, log = console }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
      id          INTEGER PRIMARY KEY,
      number      TEXT NOT NULL UNIQUE,
      account_id  INTEGER NOT NULL REFERENCES accounts(id),
      issued_at   TEXT NOT NULL,
      due_at      TEXT NOT NULL,
      months      INTEGER NOT NULL CHECK (months > 0),
      amount      INTEGER NOT NULL CHECK (amount > 0),
      status      TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'paid', 'cancelled')),
      sent_at     TEXT,
      paid_at     TEXT,
      closed_by   INTEGER
    );
    CREATE UNIQUE INDEX IF NOT EXISTS invoices_one_open
      ON invoices(account_id) WHERE status = 'issued';
  `);

  const q = {
    open: db.prepare(
      `SELECT i.*, a.name AS account_name FROM invoices i JOIN accounts a ON a.id = i.account_id
       WHERE i.status = 'issued' ORDER BY i.due_at`,
    ),
    of: db.prepare(`SELECT * FROM invoices WHERE account_id = ? ORDER BY id DESC LIMIT 50`),
    byId: db.prepare(`SELECT * FROM invoices WHERE id = ?`),
    openOf: db.prepare(`SELECT * FROM invoices WHERE account_id = ? AND status = 'issued'`),
    countYear: db.prepare(`SELECT COUNT(*) AS n FROM invoices WHERE number LIKE ?`),
    insert: db.prepare(
      `INSERT INTO invoices (number, account_id, issued_at, due_at, months, amount)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ),
    sent: db.prepare(`UPDATE invoices SET sent_at = ? WHERE id = ?`),
    close: db.prepare(
      `UPDATE invoices SET status = ?, paid_at = ?, closed_by = ? WHERE id = ? AND status = 'issued'`,
    ),
    accounts: db.prepare(
      `SELECT * FROM accounts WHERE kind = 'warehouse' AND status = 'active' AND archived_at IS NULL`,
    ),
    account: db.prepare(`SELECT * FROM accounts WHERE id = ?`),
    setPaid: db.prepare(`UPDATE accounts SET paid_until = ?, updated_at = ? WHERE id = ?`),
    payment: db.prepare(
      `INSERT INTO payments (account_id, at, months, amount, paid_until, note) VALUES (?, ?, ?, ?, ?, ?)`,
    ),
  };

  /** Выставить счёт аккаунту. Причина отказа — строкой, для админки. */
  const issue = inTx(db, (a, nowIso) => {
    if (a.kind !== "warehouse") return { error: "Счёт выставляется только складу." };
    if (q.openOf.get(a.id)) return { error: "У аккаунта уже есть неоплаченный счёт." };
    const price = monthlyPrice(a);
    if (!price) return { error: "У тарифа нет цены: впишите её в карточке." };
    const months = PERIOD_MONTHS[a.period] ?? 1;
    const year = nowIso.slice(0, 4);
    const seq = q.countYear.get(`UK-${year}-%`).n + 1;
    const number = `UK-${year}-${String(seq).padStart(4, "0")}`;
    const end = coveredUntil(a);
    const due = end && end > nowIso ? end : new Date(Date.parse(nowIso) + 3 * DAY).toISOString();
    const id = Number(
      q.insert.run(number, a.id, nowIso, due, months, price * months).lastInsertRowid,
    );
    return { invoice: q.byId.get(id) };
  });

  async function deliver(inv, nowIso) {
    const a = q.account.get(inv.account_id);
    if (!send || !payee || !a) return false;
    const { subject, text } = letter(inv, a, payee);
    try {
      await send({ to: a.email, subject, text });
      q.sent.run(nowIso, inv.id);
      return true;
    } catch (e) {
      log.error?.(`[uklad] счёт ${inv.number} не ушёл: ${e.message}`);
      return false;
    }
  }

  /** Обход раз в час: выставить и отправить счета, у кого срок подходит. */
  async function issueDue(nowIso) {
    if (!payee) return [];
    const edge = new Date(Date.parse(nowIso) + ISSUE_BEFORE_DAYS * DAY).toISOString();
    const made = [];
    for (const a of q.accounts.all()) {
      const end = coveredUntil(a);
      if (!end || end > edge || q.openOf.get(a.id) || !monthlyPrice(a)) continue;
      const r = issue(a, nowIso);
      if (r.invoice) made.push(r.invoice);
    }
    for (const inv of made) await deliver(inv, nowIso);
    return made;
  }

  /**
   * Засчитать оплату. Срок продлевается от «оплачено до», если оно впереди,
   * иначе от сегодня. Закрытый счёт второй раз не продлевает.
   */
  const markPaid = inTx(db, (id, nowIso, adminId) => {
    const inv = q.byId.get(id);
    if (!inv) return { error: "Счёт не найден." };
    if (inv.status !== "issued") {
      return { error: `Счёт уже ${STATUS_TITLES[inv.status].toLowerCase()}.` };
    }
    const a = q.account.get(inv.account_id);
    const from = a.paid_until && a.paid_until > nowIso ? a.paid_until : nowIso;
    const paidUntil = plans.addMonths(from, inv.months);
    q.close.run("paid", nowIso, adminId ?? null, id);
    q.setPaid.run(paidUntil, nowIso, a.id);
    q.payment.run(a.id, nowIso, inv.months, inv.amount, paidUntil, `счёт № ${inv.number}`);
    return { invoice: q.byId.get(id), account: a, paidUntil };
  });

  function cancel(id, adminId) {
    const changed = q.close.run("cancelled", null, adminId ?? null, id).changes;
    return changed
      ? { invoice: q.byId.get(id) }
      : { error: "Отменить можно только неоплаченный счёт." };
  }

  /** Поиск по строке выписки: номер счёта, сумма или название склада. */
  function find(needle) {
    const open = q.open.all();
    const s = String(needle ?? "").trim();
    if (!s) return open;
    const num = /UK-\d{4}-\d{4}/i.exec(s)?.[0]?.toUpperCase();
    if (num) return open.filter((i) => i.number === num);
    const sum = Number(s.replace(/[\s₽]/g, "").replace(",", "."));
    if (Number.isFinite(sum) && sum > 0) return open.filter((i) => i.amount === Math.round(sum));
    return open.filter((i) => i.account_name.toLowerCase().includes(s.toLowerCase()));
  }

  return {
    ready: Boolean(payee),
    open: () => q.open.all(),
    of: (accountId) => q.of.all(accountId),
    byId: (id) => q.byId.get(id),
    issue: (a, nowIso) => issue(a, nowIso),
    deliver,
    issueDue,
    markPaid,
    cancel,
    find,
  };
}

module.exports = {
  createInvoices,
  readPayee,
  letter,
  coveredUntil,
  STATUS_TITLES,
  ISSUE_BEFORE_DAYS,
};
