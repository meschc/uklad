/**
 * Таблицы админки в той же базе SQLite, что и заявки.
 *
 *  admins          — кто входит в админку. Сегодня одна строка: Кирилл.
 *                    Создаётся только командой на сервере (`cli.js`).
 *  admin_sessions  — сессии входа. В базе лежит хэш токена, а не он сам:
 *                    утёкшая копия базы не даёт войти.
 *  accounts        — склады и селлеры, клиенты Уклада: контакты, тариф,
 *                    пробный период, оплачено до, менеджер, функции и лимиты.
 *  payments        — продления: сколько месяцев и за сколько. Не касса, а
 *                    память «кто когда платил».
 *  managers        — персональные менеджеры для «Оператора».
 *  access_resets   — одноразовые ссылки сброса доступа (тоже по хэшу).
 *  admin_audit     — журнал действий. Только дописывается: правку и
 *                    удаление запрещают триггеры, а не честное слово кода.
 *
 * Заявки (`leads`) и демо-ссылки (`demo_links`) создаёт `db.js`; админка
 * дописывает заявке статус и заметку.
 *
 * Схема растёт добавлением колонок (`ensureColumns`): база на сервере уже
 * может быть, пересоздавать её нельзя.
 */
/* global require, module */
/* eslint-disable @typescript-eslint/no-require-imports */
const { createHash } = require("node:crypto");

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

function ensureColumns(db, table, columns) {
  const have = new Set(
    db
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((c) => c.name),
  );
  for (const [name, type] of Object.entries(columns)) {
    if (!have.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
  }
}

/** Поля аккаунта, которые админка правит формами. Остальное — только кодом. */
const ACCOUNT_FIELDS = [
  "kind",
  "name",
  "email",
  "contact_name",
  "phone",
  "company",
  "inn",
  "city",
  "note",
  "tariff",
  "price",
  "period",
  "trial_until",
  "paid_until",
  "manager_id",
  "features",
  "limits",
];

function adminStore(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id            INTEGER PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      totp_secret   TEXT NOT NULL,
      totp_last     INTEGER NOT NULL DEFAULT -1,
      failed        INTEGER NOT NULL DEFAULT 0,
      locked_until  TEXT,
      created_at    TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash  TEXT PRIMARY KEY,
      admin_id    INTEGER NOT NULL REFERENCES admins(id),
      csrf        TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      seen_at     TEXT NOT NULL,
      expires_at  TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS accounts (
      id            INTEGER PRIMARY KEY,
      kind          TEXT NOT NULL CHECK (kind IN ('warehouse', 'seller')),
      name          TEXT NOT NULL,
      email         TEXT NOT NULL UNIQUE,
      status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
      blocked_note  TEXT,
      created_at    TEXT NOT NULL,
      last_login_at TEXT
    );
    CREATE TABLE IF NOT EXISTS managers (
      id         INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      contact    TEXT,
      active     INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS payments (
      id          INTEGER PRIMARY KEY,
      account_id  INTEGER NOT NULL REFERENCES accounts(id),
      at          TEXT NOT NULL,
      months      INTEGER NOT NULL,
      amount      INTEGER,
      paid_until  TEXT NOT NULL,
      note        TEXT
    );
    CREATE TABLE IF NOT EXISTS access_resets (
      token_hash  TEXT PRIMARY KEY,
      account_id  INTEGER NOT NULL REFERENCES accounts(id),
      created_at  TEXT NOT NULL,
      expires_at  TEXT NOT NULL,
      used_at     TEXT
    );
    CREATE TABLE IF NOT EXISTS admin_audit (
      id         INTEGER PRIMARY KEY,
      at         TEXT NOT NULL,
      admin_id   INTEGER,
      action     TEXT NOT NULL,
      target     TEXT,
      detail     TEXT
    );
    CREATE TRIGGER IF NOT EXISTS admin_audit_no_update BEFORE UPDATE ON admin_audit
      BEGIN SELECT RAISE(ABORT, 'журнал только дописывается'); END;
    CREATE TRIGGER IF NOT EXISTS admin_audit_no_delete BEFORE DELETE ON admin_audit
      BEGIN SELECT RAISE(ABORT, 'журнал только дописывается'); END;
  `);
  ensureColumns(db, "accounts", {
    contact_name: "TEXT",
    phone: "TEXT",
    company: "TEXT",
    inn: "TEXT",
    city: "TEXT",
    note: "TEXT",
    tariff: "TEXT NOT NULL DEFAULT 'start'",
    price: "INTEGER",
    period: "TEXT NOT NULL DEFAULT 'month'",
    trial_until: "TEXT",
    paid_until: "TEXT",
    manager_id: "INTEGER",
    features: "TEXT",
    limits: "TEXT",
    archived_at: "TEXT",
    updated_at: "TEXT",
  });
  // Таблицы заявок создаёт db.js; в тестах админки их может не быть.
  const hasLeads = db.prepare(`SELECT 1 FROM sqlite_master WHERE name = 'leads'`).get();
  if (hasLeads) {
    ensureColumns(db, "leads", {
      status: "TEXT NOT NULL DEFAULT 'new'",
      note: "TEXT",
      account_id: "INTEGER",
    });
  }

  const q = {
    adminByEmail: db.prepare(`SELECT * FROM admins WHERE email = ?`),
    adminById: db.prepare(`SELECT * FROM admins WHERE id = ?`),
    countAdmins: db.prepare(`SELECT COUNT(*) AS n FROM admins`),
    insertAdmin: db.prepare(
      `INSERT INTO admins (email, password_hash, totp_secret, created_at) VALUES (?, ?, ?, ?)`,
    ),
    failAdmin: db.prepare(`UPDATE admins SET failed = ?, locked_until = ? WHERE id = ?`),
    passAdmin: db.prepare(
      `UPDATE admins SET failed = 0, locked_until = NULL, totp_last = ? WHERE id = ?`,
    ),
    setPassword: db.prepare(`UPDATE admins SET password_hash = ? WHERE id = ?`),
    setTotpLast: db.prepare(`UPDATE admins SET totp_last = ? WHERE id = ?`),
    insertSession: db.prepare(
      `INSERT INTO admin_sessions (token_hash, admin_id, csrf, created_at, seen_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ),
    findSession: db.prepare(`SELECT * FROM admin_sessions WHERE token_hash = ?`),
    sessionsOf: db.prepare(`SELECT * FROM admin_sessions WHERE admin_id = ? ORDER BY seen_at DESC`),
    touchSession: db.prepare(`UPDATE admin_sessions SET seen_at = ? WHERE token_hash = ?`),
    dropSession: db.prepare(`DELETE FROM admin_sessions WHERE token_hash = ?`),
    dropOtherSessions: db.prepare(
      `DELETE FROM admin_sessions WHERE admin_id = ? AND token_hash <> ?`,
    ),
    purgeSessions: db.prepare(`DELETE FROM admin_sessions WHERE expires_at < ?`),

    allAccounts: db.prepare(`SELECT * FROM accounts ORDER BY created_at DESC`),
    account: db.prepare(`SELECT * FROM accounts WHERE id = ?`),
    accountByEmail: db.prepare(`SELECT * FROM accounts WHERE email = ?`),
    insertAccount: db.prepare(
      `INSERT INTO accounts (kind, name, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    ),
    setStatus: db.prepare(
      `UPDATE accounts SET status = ?, blocked_note = ?, updated_at = ? WHERE id = ?`,
    ),
    setArchived: db.prepare(`UPDATE accounts SET archived_at = ?, updated_at = ? WHERE id = ?`),
    insertReset: db.prepare(
      `INSERT INTO access_resets (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)`,
    ),
    killResets: db.prepare(
      `UPDATE access_resets SET used_at = ? WHERE account_id = ? AND used_at IS NULL`,
    ),

    insertPayment: db.prepare(
      `INSERT INTO payments (account_id, at, months, amount, paid_until, note) VALUES (?, ?, ?, ?, ?, ?)`,
    ),
    paymentsOf: db.prepare(`SELECT * FROM payments WHERE account_id = ? ORDER BY id DESC`),
    paymentsSince: db.prepare(`SELECT COALESCE(SUM(amount), 0) AS sum FROM payments WHERE at >= ?`),

    managers: db.prepare(`SELECT * FROM managers ORDER BY active DESC, name`),
    manager: db.prepare(`SELECT * FROM managers WHERE id = ?`),
    insertManager: db.prepare(`INSERT INTO managers (name, contact, created_at) VALUES (?, ?, ?)`),
    updateManager: db.prepare(`UPDATE managers SET name = ?, contact = ?, active = ? WHERE id = ?`),

    insertAudit: db.prepare(
      `INSERT INTO admin_audit (at, admin_id, action, target, detail) VALUES (?, ?, ?, ?, ?)`,
    ),
    audit: db.prepare(
      `SELECT * FROM admin_audit WHERE (?1 = '' OR action = ?1) ORDER BY id DESC LIMIT ?2`,
    ),
    auditOf: db.prepare(`SELECT * FROM admin_audit WHERE target = ? ORDER BY id DESC LIMIT 50`),
  };

  const leadQ = hasLeads
    ? {
        leads: db.prepare(
          `SELECT * FROM leads WHERE (?1 = '' OR status = ?1) ORDER BY id DESC LIMIT 500`,
        ),
        lead: db.prepare(`SELECT * FROM leads WHERE id = ?`),
        setLead: db.prepare(`UPDATE leads SET status = ?, note = ? WHERE id = ?`),
        linkLead: db.prepare(`UPDATE leads SET account_id = ?, status = 'won' WHERE id = ?`),
        countNew: db.prepare(`SELECT COUNT(*) AS n FROM leads WHERE status = 'new'`),
        demos: db.prepare(`SELECT * FROM demo_links ORDER BY created_at DESC LIMIT 500`),
      }
    : null;

  // Обращения живут в той же базе, что и заявки: таблицу заводит `db.js`.
  const hasReports = db.prepare(`SELECT 1 FROM sqlite_master WHERE name = 'support_reports'`).get();
  const repQ = hasReports
    ? {
        reports: db.prepare(
          `SELECT id, created_at, message, view, errors, has_snapshot, status, note
           FROM support_reports WHERE (?1 = '' OR status = ?1) ORDER BY id DESC LIMIT 500`,
        ),
        report: db.prepare(`SELECT * FROM support_reports WHERE id = ?`),
        setReport: db.prepare(`UPDATE support_reports SET status = ?, note = ? WHERE id = ?`),
        countNew: db.prepare(`SELECT COUNT(*) AS n FROM support_reports WHERE status = 'new'`),
      }
    : null;

  return {
    hasReports: Boolean(repQ),
    reports: (status = "") => (repQ ? repQ.reports.all(status) : []),
    report: (id) => repQ?.report.get(id),
    setReport: (id, status, note) => repQ?.setReport.run(status, note, id),
    countNewReports: () => (repQ ? repQ.countNew.get().n : 0),
    countAdmins: () => q.countAdmins.get().n,
    addAdmin: (a, now) =>
      q.insertAdmin.run(a.email, a.passwordHash, a.totpSecret, now.toISOString()),
    adminByEmail: (email) => q.adminByEmail.get(email),
    adminById: (id) => q.adminById.get(id),
    failAdmin: (id, failed, lockedUntil) => q.failAdmin.run(failed, lockedUntil, id),
    passAdmin: (id, totpStep) => q.passAdmin.run(totpStep, id),
    setPassword: (id, hash) => q.setPassword.run(hash, id),
    setTotpLast: (id, step) => q.setTotpLast.run(step, id),

    addSession: (s) =>
      q.insertSession.run(s.tokenHash, s.adminId, s.csrf, s.createdAt, s.createdAt, s.expiresAt),
    findSession: (tokenHash) => q.findSession.get(tokenHash),
    sessionsOf: (adminId) => q.sessionsOf.all(adminId),
    touchSession: (tokenHash, now) => q.touchSession.run(now.toISOString(), tokenHash),
    dropSession: (tokenHash) => q.dropSession.run(tokenHash),
    dropOtherSessions: (adminId, keepHash) =>
      Number(q.dropOtherSessions.run(adminId, keepHash).changes),
    purgeSessions: (now) => q.purgeSessions.run(now.toISOString()),

    allAccounts: () => q.allAccounts.all(),
    account: (id) => q.account.get(id),
    accountByEmail: (email) => q.accountByEmail.get(email),
    addAccount: (a, now) => {
      const t = now.toISOString();
      const id = Number(q.insertAccount.run(a.kind, a.name, a.email, t, t).lastInsertRowid);
      const rest = { ...a };
      delete rest.kind;
      delete rest.name;
      delete rest.email;
      if (Object.keys(rest).length) updateAccountRow(id, rest, now);
      return id;
    },
    updateAccount: (id, patch, now) => updateAccountRow(id, patch, now),
    setStatus: (id, status, note, now) =>
      q.setStatus.run(status, note ?? null, now.toISOString(), id),
    setArchived: (id, at, now) => q.setArchived.run(at, now.toISOString(), id),
    /** Новая ссылка гасит все прежние: живой остаётся только последняя. */
    addReset: (accountId, tokenHash, now, expiresAt) => {
      q.killResets.run(now.toISOString(), accountId);
      q.insertReset.run(tokenHash, accountId, now.toISOString(), expiresAt);
    },

    addPayment: (p) =>
      q.insertPayment.run(
        p.accountId,
        p.at,
        p.months,
        p.amount ?? null,
        p.paidUntil,
        p.note ?? null,
      ),
    paymentsOf: (accountId) => q.paymentsOf.all(accountId),
    paymentsSince: (iso) => q.paymentsSince.get(iso).sum,

    managers: () => q.managers.all(),
    manager: (id) => q.manager.get(id),
    addManager: (m, now) =>
      Number(q.insertManager.run(m.name, m.contact ?? null, now.toISOString()).lastInsertRowid),
    updateManager: (id, m) => q.updateManager.run(m.name, m.contact ?? null, m.active ? 1 : 0, id),

    hasLeads: Boolean(leadQ),
    leads: (status = "") => (leadQ ? leadQ.leads.all(status) : []),
    lead: (id) => leadQ?.lead.get(id),
    setLead: (id, status, note) => leadQ?.setLead.run(status, note ?? null, id),
    linkLead: (id, accountId) => leadQ?.linkLead.run(accountId, id),
    countNewLeads: () => (leadQ ? leadQ.countNew.get().n : 0),
    demos: () => (leadQ ? leadQ.demos.all() : []),

    log: (now, adminId, action, target, detail) =>
      q.insertAudit.run(
        now.toISOString(),
        adminId ?? null,
        action,
        target ?? null,
        detail === undefined ? null : JSON.stringify(detail),
      ),
    audit: (limit = 200, action = "") => q.audit.all(action, limit),
    auditOf: (target) => q.auditOf.all(target),
  };

  /**
   * Правка аккаунта по белому списку полей: имя колонки в SQL никогда не
   * приходит из формы, только из `ACCOUNT_FIELDS`.
   */
  function updateAccountRow(id, patch, now) {
    const keys = Object.keys(patch).filter((k) => ACCOUNT_FIELDS.includes(k));
    if (!keys.length) return;
    const sets = keys.map((k) => `${k} = ?`).join(", ");
    db.prepare(`UPDATE accounts SET ${sets}, updated_at = ? WHERE id = ?`).run(
      ...keys.map((k) => patch[k] ?? null),
      now.toISOString(),
      id,
    );
  }
}

module.exports = { adminStore, sha256, ACCOUNT_FIELDS };
