/**
 * Кабинет компании на сервере одним снимком (ADR 0010, миграция 008).
 *
 * Переходный шаг, пока работа склада раскладывается по таблицам: сервер
 * хранит тот же JSON, что кабинет держит в браузере (`persistedState`).
 * Сервер его не разбирает — только проверяет, что это объект нужного
 * размера, и ставит компанию из сессии: чужой снимок не прочитать и не
 * записать, это решает RLS.
 *
 * Одновременная правка с двух устройств: запись проходит, только если
 * клиент знает текущую `version`. Не знает — 409 и текущая версия: клиент
 * забирает свежий снимок, а не затирает чужую работу молча.
 *
 * Кому: только вход по паролю с правом `staff.manage` (владелец, начальник
 * склада). В снимке весь кабинет — ставки, журнал смен, товар всех продавцов,
 * — поэтому продавец и вход по бейджу получают 403: своё они увидят через
 * отдельные таблицы, когда снимок разложится по ним.
 *
 * Маршруты:
 *   GET  /api/cabinet/snapshot — снимок компании или `snapshot: null`
 *   POST /api/cabinet/snapshot — { version, format, data }; version 0 — первая запись
 */
/* global require, module */
/* eslint-disable @typescript-eslint/no-require-imports */
const { createRateLimit } = require("../rateLimit");

// Пустой кабинет — единицы килобайт, демо со всей историей — около мегабайта.
// Восемь — с запасом, но не столько, чтобы одним запросом забить диск.
const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;
// Кабинет пишет не чаще раза в 5 секунд на человека; 30 записей в минуту на
// компанию — запас на несколько устройств, но не на скрипт с мегабайтами.
const WRITES_PER_MINUTE = 30;

const FORBIDDEN = Symbol("forbidden");
const LIMITED = Symbol("limited");
/** Снимок — весь кабинет: только руководитель, вошедший паролем. */
const mayUse = (ctx) => Boolean(ctx.accountId) && ctx.can("staff.manage");

function createSnapshot({ auth, send, log }) {
  const { withSession, readJson } = auth;
  const writes = createRateLimit({
    capacity: WRITES_PER_MINUTE,
    refillPerMinute: WRITES_PER_MINUTE,
  });

  async function load(req, res) {
    const out = await withSession(req, async (c, ctx) => {
      if (!mayUse(ctx)) return FORBIDDEN;
      const { rows } = await c.query(
        `SELECT version, format, data, updated_at FROM uklad.cabinet_snapshots
         WHERE org_id = uklad.current_org()`,
      );
      return rows[0] ?? false;
    });
    if (out === null) return send(res, 401, { ok: false });
    if (out === FORBIDDEN) return send(res, 403, { ok: false });
    if (!out) return send(res, 200, { ok: true, snapshot: null });
    return send(res, 200, {
      ok: true,
      snapshot: {
        version: out.version,
        format: out.format,
        data: out.data,
        updatedAt: out.updated_at,
      },
    });
  }

  async function save(req, res) {
    const b = await readJson(req, res, MAX_SNAPSHOT_BYTES);
    if (!b) return;
    const version = b.version;
    const format = b.format;
    if (
      !Number.isInteger(version) ||
      version < 0 ||
      !Number.isInteger(format) ||
      format < 1 ||
      !b.data ||
      typeof b.data !== "object" ||
      Array.isArray(b.data)
    ) {
      return send(res, 400, { ok: false, error: "bad_request" });
    }
    const data = JSON.stringify(b.data);
    const out = await withSession(req, async (c, ctx) => {
      if (!mayUse(ctx)) return FORBIDDEN;
      if (!writes.take(ctx.orgId)) return LIMITED;
      // Первая запись: строки ещё нет. Двое одновременно — второй получит
      // конфликт ключа и ответ 409, а не вторую строку.
      if (version === 0) {
        const { rows } = await c.query(
          `INSERT INTO uklad.cabinet_snapshots (org_id, format, data, updated_by)
           VALUES (uklad.current_org(), $1, $2::jsonb, $3)
           ON CONFLICT (org_id) DO NOTHING
           RETURNING version`,
          [format, data, ctx.memberId],
        );
        return rows[0] ? { version: rows[0].version } : { conflict: true };
      }
      const { rows } = await c.query(
        `UPDATE uklad.cabinet_snapshots
         SET previous = data, data = $1::jsonb, format = $2, version = version + 1,
             updated_at = now(), updated_by = $3
         WHERE org_id = uklad.current_org() AND version = $4
         RETURNING version`,
        [data, format, ctx.memberId, version],
      );
      return rows[0] ? { version: rows[0].version } : { conflict: true };
    });
    if (out === null) return send(res, 401, { ok: false });
    if (out === FORBIDDEN) return send(res, 403, { ok: false });
    if (out === LIMITED) return send(res, 429, { ok: false }, { "Retry-After": "30" });
    if (out.conflict) {
      const current = await withSession(req, async (c) => {
        const { rows } = await c.query(
          `SELECT version FROM uklad.cabinet_snapshots WHERE org_id = uklad.current_org()`,
        );
        return rows[0]?.version ?? 0;
      });
      return send(res, 409, { ok: false, error: "conflict", version: current ?? 0 });
    }
    return send(res, 200, { ok: true, version: out.version });
  }

  const routes = {
    "GET /api/cabinet/snapshot": load,
    "POST /api/cabinet/snapshot": save,
  };

  /** Обработчик маршрутов снимка. `false` — маршрут не наш. */
  async function handle(req, res, url) {
    const route = routes[`${req.method} ${url.pathname}`];
    if (!route) return false;
    try {
      await route(req, res, url);
    } catch (err) {
      log.error("[uklad] сбой снимка кабинета:", err.message);
      if (!res.headersSent) send(res, 500, { ok: false });
    }
    return true;
  }

  return { handle };
}

module.exports = { createSnapshot, MAX_SNAPSHOT_BYTES };
