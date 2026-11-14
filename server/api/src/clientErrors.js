/**
 * Ошибки у пользователей — сами, без кнопки (аудит запуска, п.3).
 *
 * Кабинет при падении экрана или необработанной ошибке шлёт сюда короткую
 * запись: откуда (`screen:<экран>`, `window`, `promise`), на каком экране,
 * первую строку ошибки и верх стека. Данных склада, введённых значений и
 * сведений о человеке в записи нет, а то, что всё же просочилось в текст
 * ошибки (почта, телефон, ФИО), стирается дважды: в браузере и здесь
 * (`scrubText`). Иностранных сервисов вроде Sentry нет — 152-ФЗ.
 *
 * Одинаковые ошибки склеиваются по отпечатку: источник + текст, где числа и
 * длинные номера заменены на «N». Так «товар 128 не найден» и «товар 129 не
 * найден» — одна строка со счётчиком, а не сотня писем.
 *
 * Почта: новая ошибка — письмо сразу (не больше `NEW_LETTERS_PER_DAY` в
 * сутки, дальше только в сводке), раз в сутки — сводка по тому, что
 * повторялось. Пустой сводки нет: нет ошибок — нет письма.
 */
/* global require, module, console */
/* eslint-disable @typescript-eslint/no-require-imports */
const crypto = require("node:crypto");
const { scrubText } = require("./support");

const MAX_MESSAGE = 300;
const MAX_STACK = 2000;
const MAX_STACK_LINES = 8;
/** Сколько писем «новая ошибка» за сутки: дальше — только сводка. */
const NEW_LETTERS_PER_DAY = 20;
/** Сколько строк в сводке: остальное — числом «и ещё N». */
const DIGEST_ROWS = 30;
const DAY_MS = 86_400_000;

const SOURCE = /^(window|promise|screen:[\w-]{1,40})$/;
const VIEW = /^[\w-]{0,40}$/;
const isObj = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);

/** Адреса в стеке — без `?…` и `#…`: в строке запроса бывает что угодно. */
const stripQuery = (s) => s.replace(/(https?:\/\/[^\s?#)]+)[?#][^\s)]*/g, "$1");

function parseClientError(raw) {
  if (!isObj(raw) || raw.version !== 1) return { ok: false, error: "не того вида" };
  if (typeof raw.source !== "string" || !SOURCE.test(raw.source)) {
    return { ok: false, error: "источник" };
  }
  if (typeof raw.message !== "string") return { ok: false, error: "нет текста" };
  const message = scrubText(raw.message.split("\n")[0].trim()).slice(0, MAX_MESSAGE);
  if (!message) return { ok: false, error: "пустой текст" };
  const view = typeof raw.view === "string" && VIEW.test(raw.view) ? raw.view : "";
  const stack =
    typeof raw.stack === "string"
      ? scrubText(stripQuery(raw.stack.slice(0, MAX_STACK * 2)))
          .split("\n")
          .slice(0, MAX_STACK_LINES)
          .join("\n")
          .slice(0, MAX_STACK)
      : "";
  return { ok: true, error: { source: raw.source, view, message, stack } };
}

/**
 * Отпечаток для склейки. Числа и hex-номера — в «N»: номер записи в тексте
 * ошибки не делает её другой ошибкой. Экран не входит: одна и та же поломка
 * на двух экранах — одна строка, экран в ней — последний.
 */
function fingerprintOf({ source, message }) {
  const norm = message.replace(/\b[0-9a-f]{8,}\b/gi, "N").replace(/\d+/g, "N");
  return crypto.createHash("sha1").update(`${source}\n${norm}`).digest("hex").slice(0, 16);
}

/** Таблица рядом с остальными в том же файле SQLite (`db.raw`). */
function errorStore(db) {
  db.exec(`
    -- Ошибки у пользователей, склеенные по отпечатку. day_count — сколько раз
    -- с прошлой сводки; сводка его обнуляет.
    CREATE TABLE IF NOT EXISTS client_errors (
      fingerprint TEXT PRIMARY KEY,
      source      TEXT NOT NULL,
      view        TEXT NOT NULL,
      message     TEXT NOT NULL,
      stack       TEXT NOT NULL,
      first_seen  TEXT NOT NULL,
      last_seen   TEXT NOT NULL,
      count       INTEGER NOT NULL DEFAULT 1,
      day_count   INTEGER NOT NULL DEFAULT 1,
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS client_errors_first ON client_errors (first_seen);
    -- Когда ушла последняя сводка: переживает перезапуск и выкладку.
    CREATE TABLE IF NOT EXISTS client_errors_meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  // Таблица из первой версии (#138) без отметки «разобрано».
  if (
    !db
      .prepare(`PRAGMA table_info(client_errors)`)
      .all()
      .some((c) => c.name === "resolved_at")
  ) {
    db.exec(`ALTER TABLE client_errors ADD COLUMN resolved_at TEXT`);
  }
  const q = {
    find: db.prepare(`SELECT fingerprint FROM client_errors WHERE fingerprint = ?`),
    // Для админки: разобранные — с отметкой, повтор после неё снимает отметку.
    list: db.prepare(
      `SELECT * FROM client_errors
        WHERE (?1 = '' OR (?1 = 'open' AND resolved_at IS NULL) OR (?1 = 'done' AND resolved_at IS NOT NULL))
        ORDER BY last_seen DESC LIMIT 500`,
    ),
    one: db.prepare(`SELECT * FROM client_errors WHERE fingerprint = ?`),
    resolve: db.prepare(`UPDATE client_errors SET resolved_at = ? WHERE fingerprint = ?`),
    countOpen: db.prepare(`SELECT COUNT(*) AS n FROM client_errors WHERE resolved_at IS NULL`),
    insert: db.prepare(
      `INSERT INTO client_errors (fingerprint, source, view, message, stack, first_seen, last_seen)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ),
    bump: db.prepare(
      `UPDATE client_errors
          SET count = count + 1, day_count = day_count + 1, last_seen = ?, view = ?, stack = ?,
            resolved_at = NULL
        WHERE fingerprint = ?`,
    ),
    newSince: db.prepare(`SELECT COUNT(*) AS n FROM client_errors WHERE first_seen >= ?`),
    pending: db.prepare(
      `SELECT * FROM client_errors WHERE day_count > 0 ORDER BY day_count DESC, last_seen DESC`,
    ),
    reset: db.prepare(`UPDATE client_errors SET day_count = 0 WHERE day_count > 0`),
    getMeta: db.prepare(`SELECT value FROM client_errors_meta WHERE key = ?`),
    setMeta: db.prepare(
      `INSERT INTO client_errors_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ),
    purge: db.prepare(`DELETE FROM client_errors WHERE last_seen < ?`),
  };
  return {
    /** Записать ошибку. `fresh` — такой ещё не было. */
    add(e, now) {
      const fp = fingerprintOf(e);
      const at = now.toISOString();
      if (q.find.get(fp)) {
        q.bump.run(at, e.view, e.stack, fp);
        return { fingerprint: fp, fresh: false };
      }
      q.insert.run(fp, e.source, e.view, e.message, e.stack, at, at);
      return { fingerprint: fp, fresh: true };
    },
    list: (state = "") => q.list.all(state),
    one: (fingerprint) => q.one.get(fingerprint),
    /** `at` — отметка «разобрано», `null` — вернуть в открытые. */
    setResolved: (fingerprint, at) => Number(q.resolve.run(at, fingerprint).changes) > 0,
    countOpen: () => Number(q.countOpen.get().n),
    newLastDay: (now) => Number(q.newSince.get(new Date(now.getTime() - DAY_MS).toISOString()).n),
    pending: () => q.pending.all(),
    reset: () => q.reset.run(),
    lastDigest: () => q.getMeta.get("last_digest")?.value ?? null,
    markDigest: (now) => q.setMeta.run("last_digest", now.toISOString()),
    purge: (now, days) =>
      Number(q.purge.run(new Date(now.getTime() - days * DAY_MS).toISOString()).changes),
  };
}

function newErrorLetter(e, adminOrigin) {
  const lines = ["Новая ошибка у пользователя.", "", e.message, "", `Откуда: ${e.source}`];
  lines.push(`Экран: ${e.view || "—"}`);
  if (e.stack) lines.push("", e.stack);
  if (adminOrigin) lines.push("", `Админка: ${adminOrigin}`);
  return { subject: `Уклад: новая ошибка · ${e.view || e.source}`, text: lines.join("\n") };
}

function digestLetter(rows) {
  const total = rows.reduce((s, r) => s + r.day_count, 0);
  const lines = [`За сутки ошибок: ${total}, разных: ${rows.length}.`, ""];
  for (const r of rows.slice(0, DIGEST_ROWS)) {
    const fresh = r.count === r.day_count ? " · новая" : "";
    lines.push(`${r.day_count} × ${r.message}`, `   ${r.source}, экран ${r.view || "—"}${fresh}`);
  }
  if (rows.length > DIGEST_ROWS) lines.push("", `И ещё разных: ${rows.length - DIGEST_ROWS}.`);
  return { subject: `Уклад: ошибки за сутки — ${total}`, text: lines.join("\n") };
}

/**
 * Приём и почта поверх хранилища. Сводка — `digestDue`: зовётся раз в час,
 * отправляет, только если с прошлой прошли сутки и было что сообщить.
 */
function createClientErrors({ store, mail, adminOrigin = "", log = console }) {
  function accept(e, now) {
    const { fresh } = store.add(e, now);
    // Новая ошибка — письмо сразу, но не лавиной: поломка, у которой в тексте
    // каждый раз своё, иначе завалит ящик.
    if (fresh && store.newLastDay(now) <= NEW_LETTERS_PER_DAY) {
      mail
        .sendLetter(newErrorLetter(e, adminOrigin))
        .catch((error) => log.error("[uklad] письмо о новой ошибке не ушло:", error));
    }
    return fresh;
  }

  async function digestDue(now) {
    const last = store.lastDigest();
    if (!last) {
      // Первый запуск: отсчёт суток начинаем отсюда, а не шлём сводку сразу.
      store.markDigest(now);
      return false;
    }
    if (now.getTime() - Date.parse(last) < DAY_MS) return false;
    const rows = store.pending();
    store.markDigest(now);
    if (!rows.length) return false;
    try {
      await mail.sendLetter(digestLetter(rows));
      store.reset();
      return true;
    } catch (error) {
      // Счётчики не обнуляем: ошибки войдут в следующую сводку.
      log.error("[uklad] сводка ошибок не ушла:", error);
      return false;
    }
  }

  return { accept, digestDue };
}

module.exports = { parseClientError, fingerprintOf, errorStore, createClientErrors };
