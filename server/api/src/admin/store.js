/**
 * Таблицы админки в той же базе SQLite, что и заявки.
 *
 *  admins          — кто входит в админку. Сегодня одна строка: Кирилл.
 *                    Создаётся только командой на сервере (`cli.js`).
 *  admin_sessions  — сессии входа. В базе лежит хэш токена, а не он сам:
 *                    утёкшая копия базы не даёт войти.
 *  accounts        — склады и селлеры, клиенты Уклада.
 *  access_resets   — одноразовые ссылки сброса доступа (тоже по хэшу).
 *  admin_audit     — журнал действий. Только дописывается: правку и
 *                    удаление запрещают триггеры, а не честное слово кода.
 */
/* global require, module */
/* eslint-disable @typescript-eslint/no-require-imports */
const { createHash } = require("node:crypto");

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

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
    insertSession: db.prepare(
      `INSERT INTO admin_sessions (token_hash, admin_id, csrf, created_at, seen_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ),
    findSession: db.prepare(`SELECT * FROM admin_sessions WHERE token_hash = ?`),
    touchSession: db.prepare(`UPDATE admin_sessions SET seen_at = ? WHERE token_hash = ?`),
    dropSession: db.prepare(`DELETE FROM admin_sessions WHERE token_hash = ?`),
    purgeSessions: db.prepare(`DELETE FROM admin_sessions WHERE expires_at < ?`),
    listAccounts: db.prepare(
      `SELECT * FROM accounts
       WHERE (?1 = '' OR kind = ?1) AND (?2 = '' OR name LIKE ?2 OR email LIKE ?2)
       ORDER BY created_at DESC LIMIT 500`,
    ),
    account: db.prepare(`SELECT * FROM accounts WHERE id = ?`),
    accountByEmail: db.prepare(`SELECT * FROM accounts WHERE email = ?`),
    insertAccount: db.prepare(
      `INSERT INTO accounts (kind, name, email, created_at) VALUES (?, ?, ?, ?)`,
    ),
    setStatus: db.prepare(`UPDATE accounts SET status = ?, blocked_note = ? WHERE id = ?`),
    insertReset: db.prepare(
      `INSERT INTO access_resets (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)`,
    ),
    killResets: db.prepare(
      `UPDATE access_resets SET used_at = ? WHERE account_id = ? AND used_at IS NULL`,
    ),
    insertAudit: db.prepare(
      `INSERT INTO admin_audit (at, admin_id, action, target, detail) VALUES (?, ?, ?, ?, ?)`,
    ),
    audit: db.prepare(`SELECT * FROM admin_audit ORDER BY id DESC LIMIT ?`),
    auditOf: db.prepare(`SELECT * FROM admin_audit WHERE target = ? ORDER BY id DESC LIMIT 50`),
  };

  return {
    countAdmins: () => q.countAdmins.get().n,
    addAdmin: (a, now) =>
      q.insertAdmin.run(a.email, a.passwordHash, a.totpSecret, now.toISOString()),
    adminByEmail: (email) => q.adminByEmail.get(email),
    adminById: (id) => q.adminById.get(id),
    failAdmin: (id, failed, lockedUntil) => q.failAdmin.run(failed, lockedUntil, id),
    passAdmin: (id, totpStep) => q.passAdmin.run(totpStep, id),

    addSession: (s) =>
      q.insertSession.run(s.tokenHash, s.adminId, s.csrf, s.createdAt, s.createdAt, s.expiresAt),
    findSession: (tokenHash) => q.findSession.get(tokenHash),
    touchSession: (tokenHash, now) => q.touchSession.run(now.toISOString(), tokenHash),
    dropSession: (tokenHash) => q.dropSession.run(tokenHash),
    purgeSessions: (now) => q.purgeSessions.run(now.toISOString()),

    listAccounts: ({ kind = "", search = "" } = {}) =>
      q.listAccounts.all(kind, search ? `%${search}%` : ""),
    account: (id) => q.account.get(id),
    accountByEmail: (email) => q.accountByEmail.get(email),
    addAccount: (a, now) =>
      Number(q.insertAccount.run(a.kind, a.name, a.email, now.toISOString()).lastInsertRowid),
    setStatus: (id, status, note) => q.setStatus.run(status, note ?? null, id),
    /** Новая ссылка гасит все прежние: живой остаётся только последняя. */
    addReset: (accountId, tokenHash, now, expiresAt) => {
      q.killResets.run(now.toISOString(), accountId);
      q.insertReset.run(tokenHash, accountId, now.toISOString(), expiresAt);
    },

    log: (now, adminId, action, target, detail) =>
      q.insertAudit.run(
        now.toISOString(),
        adminId ?? null,
        action,
        target ?? null,
        detail === undefined ? null : JSON.stringify(detail),
      ),
    audit: (limit = 200) => q.audit.all(limit),
    auditOf: (target) => q.auditOf.all(target),
  };
}

module.exports = { adminStore, sha256 };
