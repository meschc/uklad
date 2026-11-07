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
 *
 * Товары в снимке не хранятся (миграция 013): кабинет присылает и получает
 * их в составе снимка, а сервер раскладывает по строкам `uklad.products` —
 * со своей корзиной и журналом правок.
 */
/* global require, module, Buffer */
/* eslint-disable @typescript-eslint/no-require-imports */
const { createRateLimit } = require("../rateLimit");
const { recordMoves, invalidWork } = require("./moves");

// Пустой кабинет — единицы килобайт, демо со всей историей — около мегабайта.
// Восемь — с запасом, но не столько, чтобы одним запросом забить диск.
const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;
/** С какой доли лимита предупреждаем нас (не склад: его это только пугает). */
const NEAR_LIMIT = 0.7;

/**
 * Снимок компании подбирается к лимиту записи: дальше у неё перестанет
 * сохраняться работа. Это знаем мы, по журналу сервера, за недели до отказа.
 */
const warned = new Map();
const WARN_EVERY_MS = 60 * 60 * 1000;
function warnNearLimit(log, orgId, bytes, now = Date.now()) {
  if (bytes < NEAR_LIMIT * MAX_SNAPSHOT_BYTES) return;
  // Раз в час на компанию: стол пишет сотни раз в час, журнал не засоряем.
  if (now - (warned.get(orgId) ?? -Infinity) < WARN_EVERY_MS) return;
  warned.set(orgId, now);
  const pct = Math.round((bytes / MAX_SNAPSHOT_BYTES) * 100);
  log.warn?.(`[uklad] снимок компании ${orgId} заполнен на ${pct}% лимита записи`);
}
// Кабинет пишет не чаще раза в 5 секунд на человека; 30 записей в минуту на
// компанию — запас на несколько устройств, но не на скрипт с мегабайтами.
const WRITES_PER_MINUTE = 30;

const FORBIDDEN = Symbol("forbidden");
const LIMITED = Symbol("limited");
/** Снимок — весь кабинет: только руководитель, вошедший паролем. */
const mayUse = (ctx) => Boolean(ctx.accountId) && ctx.can("staff.manage");

/** Снимок с товарами компании из таблицы — то, что видит кабинет. */
async function withProducts(c, data) {
  const { rows } = await c.query(`SELECT uklad.load_products() AS products`);
  return { ...data, products: rows[0].products };
}

/** Снимок без товаров — то, что хранится в `cabinet_snapshots`. */
function withoutProducts(data) {
  const out = { ...data };
  delete out.products;
  return out;
}

/**
 * Убирает ли запись больше половины живого каталога. Так выглядит сбой
 * (пустой стор после ошибки), а не работа человека: из корзины в кабинете
 * пока не восстановить, поэтому такую запись сервер не принимает. Большой
 * каталог удаляется частями, и весь сразу — только из одного-двух товаров.
 */
async function massDelete(c, data) {
  if (!Array.isArray(data.products)) return false;
  const refs = data.products.map((p) => p?.id).filter((id) => typeof id === "string");
  const { rows } = await c.query(
    `SELECT count(*)::int AS live,
            count(*) FILTER (WHERE NOT (ref = ANY($1::text[])))::int AS gone
     FROM uklad.products WHERE org_id = uklad.current_org() AND deleted_at IS NULL`,
    [refs],
  );
  const { live, gone } = rows[0];
  if (gone * 2 <= live) return false;
  // Разом можно убрать до девяти, но не весь каталог: «ноль из пяти» — тоже
  // похоже на сбой. Последние один-два товара удаляются как обычно, иначе их
  // нельзя было бы удалить вовсе.
  return gone >= 10 || (gone === live && live >= 3);
}

/** Товары из присланного снимка — в таблицу. Нет поля — товары не трогаем. */
async function storeProducts(c, data) {
  if (!("products" in data)) return;
  await c.query(`SELECT uklad.save_products($1::jsonb)`, [JSON.stringify(data.products)]);
}

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
      if (!rows[0]) return false;
      return { ...rows[0], data: await withProducts(c, rows[0].data) };
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
      Array.isArray(b.data) ||
      ("products" in b.data && !Array.isArray(b.data.products)) ||
      invalidWork(b.data)
    ) {
      return send(res, 400, { ok: false, error: "bad_request" });
    }
    const data = JSON.stringify(withoutProducts(b.data));
    const out = await withSession(req, async (c, ctx) => {
      if (!mayUse(ctx)) return FORBIDDEN;
      if (!writes.take(ctx.orgId)) return LIMITED;
      if (await massDelete(c, b.data)) return { conflict: true, products: true };
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
        if (!rows[0]) return { conflict: true };
        await storeProducts(c, b.data);
        await recordMoves(c, {}, b.data, rows[0].version, { memberId: ctx.memberId });
        return { version: rows[0].version, orgId: ctx.orgId };
      }
      const { rows } = await c.query(
        `UPDATE uklad.cabinet_snapshots
         SET previous = data, data = $1::jsonb, format = $2, version = version + 1,
             updated_at = now(), updated_by = $3, updated_by_desk = NULL
         WHERE org_id = uklad.current_org() AND version = $4
         RETURNING version, previous`,
        [data, format, ctx.memberId, version],
      );
      // Версия не сошлась — товары тоже не трогаем: запись целиком не прошла.
      if (!rows[0]) return { conflict: true };
      await storeProducts(c, b.data);
      // Что где прибыло и убыло — в журнал движений, с тем, кто записал.
      await recordMoves(c, rows[0].previous, b.data, rows[0].version, {
        memberId: ctx.memberId,
      });
      return { version: rows[0].version, orgId: ctx.orgId };
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
      const error = out.products ? "products_mass_delete" : "conflict";
      return send(res, 409, { ok: false, error, version: current ?? 0 });
    }
    warnNearLimit(log, out.orgId, Buffer.byteLength(data));
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

module.exports = {
  createSnapshot,
  MAX_SNAPSHOT_BYTES,
  warnNearLimit,
  withProducts,
  withoutProducts,
};
