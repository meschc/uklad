/**
 * Хранилище сервера — один файл SQLite.
 *
 * Почему SQLite, а не Postgres. Сервер пока принимает десятки заявок в день и
 * выдаёт демо-ссылки; отдельная база — это второй контейнер, пароль, порт и
 * ещё одна вещь, которую надо поднимать и бэкапить. Файл в томе `/data`
 * бэкапится одной командой (`deploy/backup.sh`), а встроенный `node:sqlite`
 * не тянет нативных сборок. Когда кабинет переедет на сервер (п.0.4), рядом
 * встанет Postgres — схема здесь от этого не зависит.
 *
 * Хранится минимум (152-ФЗ, ст. 5 ч. 7): заявка живёт `LEADS_RETENTION_DAYS`
 * и стирается — письмо в почте и есть рабочая копия. IP не пишем вовсе.
 */
/* global require, module */
/* eslint-disable @typescript-eslint/no-require-imports */
const { DatabaseSync } = require("node:sqlite");

function openDb(file) {
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS leads (
      id          INTEGER PRIMARY KEY,
      created_at  TEXT NOT NULL,
      kind        TEXT NOT NULL,
      lang        TEXT NOT NULL,
      subject     TEXT NOT NULL,
      message     TEXT NOT NULL,
      consent_ads INTEGER NOT NULL,
      mailed      INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS demo_links (
      token      TEXT PRIMARY KEY,
      email      TEXT NOT NULL,
      lead_id    INTEGER,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      opened_at  TEXT,
      opens      INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS demo_links_email ON demo_links(email, created_at);
  `);

  const q = {
    insertLead: db.prepare(
      `INSERT INTO leads (created_at, kind, lang, subject, message, consent_ads)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ),
    markMailed: db.prepare(`UPDATE leads SET mailed = 1 WHERE id = ?`),
    insertDemo: db.prepare(
      `INSERT INTO demo_links (token, email, lead_id, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
    ),
    demosSince: db.prepare(
      `SELECT COUNT(*) AS n FROM demo_links WHERE email = ? AND created_at > ?`,
    ),
    findDemo: db.prepare(`SELECT * FROM demo_links WHERE token = ?`),
    openDemo: db.prepare(
      `UPDATE demo_links SET opens = opens + 1, opened_at = COALESCE(opened_at, ?)
       WHERE token = ?`,
    ),
    purgeLeads: db.prepare(`DELETE FROM leads WHERE created_at < ?`),
    purgeDemos: db.prepare(`DELETE FROM demo_links WHERE expires_at < ?`),
  };

  return {
    /** Сама база — для таблиц админки (`admin/store.js`), они живут рядом. */
    raw: db,
    addLead(lead, now) {
      const r = q.insertLead.run(
        now.toISOString(),
        lead.kind,
        lead.lang,
        lead.subject,
        lead.message,
        lead.consent.ads ? 1 : 0,
      );
      return Number(r.lastInsertRowid);
    },
    markMailed: (id) => q.markMailed.run(id),
    addDemo: (row) =>
      q.insertDemo.run(row.token, row.email, row.leadId, row.createdAt, row.expiresAt),
    demosSince: (email, since) => q.demosSince.get(email, since).n,
    findDemo: (token) => q.findDemo.get(token),
    openDemo: (token, now) => q.openDemo.run(now.toISOString(), token),
    /** Стереть просроченное. Возвращает, сколько строк ушло, — для журнала. */
    purge(now, retentionDays) {
      const edge = new Date(now.getTime() - retentionDays * 86_400_000).toISOString();
      const leads = Number(q.purgeLeads.run(edge).changes);
      const demos = Number(q.purgeDemos.run(now.toISOString()).changes);
      return { leads, demos };
    },
    close: () => db.close(),
  };
}

module.exports = { openDb };
