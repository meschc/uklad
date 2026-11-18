/**
 * Подключения к площадкам (WB, Ozon, Яндекс Маркет) через сервер.
 *
 * Браузер ключ селлера отдаёт один раз — при сохранении — и больше его не
 * видит: сервер хранит ключ зашифрованным (AES-256-GCM, ключ шифрования —
 * `CONNECTOR_SECRET_KEY` в окружении, не в базе) и сам ходит к площадке.
 * Адаптеры кабинета (`src/lib/connectors`) шлют сюда `ConnectorRequest`, а
 * в ответ получают JSON площадки как есть.
 *
 * Защита (README подключений, «Обязательно для сервера»):
 * 1. Белый список method + шаблон пути на каждую систему, прочее — 403.
 * 2. Подключение ищется в компании из сессии (RLS), право —
 *    `integrations.manage`.
 * 3. POST — только со своего Origin и JSON (`readJson`).
 * 4. Ключ не попадает в журналы и ответы; заголовки площадки не пропускаем.
 * 5. Лимит частоты на компанию и на подключение.
 * 7. `{campaignId}` Маркета подставляет сервер из записи подключения; путь с
 *    чужим номером в белый список не проходит.
 * 8. Ответ площадки — с пределом размера и времени.
 *
 * Маршруты:
 *   GET  /api/connectors                 — подключения компании, без ключей
 *   POST /api/connectors/save            — { system, label, clientId?, partnerId?, token } → { id }
 *     partnerId — партнёр-продавец, чей это магазин; нет — свой товар склада.
 *   POST /api/connectors/delete          — { id }
 *   POST /api/connectors/<system>/proxy  — `ConnectorRequest` → { ok, data } (JSON площадки)
 */
/* global require, module, fetch, AbortSignal, Buffer, URLSearchParams */
/* eslint-disable @typescript-eslint/no-require-imports */
const { createCipheriv, createDecipheriv, randomBytes } = require("node:crypto");
const { createRateLimit } = require("../rateLimit");

const PERM = "integrations.manage";
const TIMEOUT_MS = 20_000;
const MAX_RESPONSE = 20 * 1024 * 1024;
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SEG = "[A-Za-z0-9_.-]{1,64}";

/**
 * Что можно делать у каждой площадки. Путь сверяется целиком, по шаблону:
 * произвольный путь или метод — 403, даже с верным ключом.
 */
const SYSTEMS = {
  wildberries: {
    base: "https://marketplace-api.wildberries.ru",
    allow: [
      ["GET", /^\/api\/v3\/orders\/new$/],
      ["POST", /^\/api\/v3\/orders\/stickers$/],
      ["PUT", new RegExp(`^/api/v3/stocks/${SEG}$`)],
      ["PUT", /^\/api\/v3\/orders\/\d{1,20}\/meta\/sgtin$/],
    ],
    headers: (key) => ({ Authorization: key.token }),
  },
  ozon: {
    base: "https://api-seller.ozon.ru",
    allow: [
      ["POST", /^\/v4\/posting\/fbs\/unfulfilled\/list$/],
      ["POST", /^\/v2\/posting\/fbs\/package-label$/],
      ["POST", /^\/v2\/products\/stocks$/],
    ],
    headers: (key, params) => ({ "Client-Id": params.clientId, "Api-Key": key.token }),
    needsClientId: true,
  },
  "yandex-market": {
    base: "https://api.partner.market.yandex.ru",
    allow: [
      ["GET", /^\/v2\/campaigns\/\{campaignId\}\/orders$/],
      ["GET", new RegExp(`^/v2/campaigns/\\{campaignId\\}/orders/${SEG}/delivery/labels$`)],
      ["PUT", /^\/v2\/campaigns\/\{campaignId\}\/offers\/stocks$/],
    ],
    headers: (key) => ({ "Api-Key": key.token }),
    needsClientId: true, // campaignId
    path: (p, params) => p.replace("{campaignId}", encodeURIComponent(params.clientId)),
  },
};

/** Разрешён ли вызов: метод и путь из белого списка системы. */
function allowed(system, method, path) {
  const s = SYSTEMS[system];
  if (!s || typeof method !== "string" || typeof path !== "string") return false;
  if (path.length > 300 || path.includes("..") || path.includes("//")) return false;
  return s.allow.some(([m, re]) => m === method && re.test(path));
}

/** Строка запроса: только простые значения, не больше 20 ключей. */
function queryString(query) {
  if (query == null) return "";
  if (typeof query !== "object" || Array.isArray(query)) return null;
  const entries = Object.entries(query);
  if (entries.length > 20) return null;
  const q = new URLSearchParams();
  for (const [k, v] of entries) {
    if (!/^[A-Za-z0-9_]{1,40}$/.test(k)) return null;
    if (typeof v !== "string" && typeof v !== "number") return null;
    q.set(k, String(v).slice(0, 200));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** Шифр ключа селлера. `key` — 32 байта из окружения. */
function createSealer(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) return null;
  return {
    seal(plain, aad) {
      const iv = randomBytes(12);
      const c = createCipheriv("aes-256-gcm", key, iv);
      c.setAAD(Buffer.from(aad));
      const body = Buffer.concat([c.update(JSON.stringify(plain), "utf8"), c.final()]);
      return Buffer.concat([iv, c.getAuthTag(), body]);
    },
    open(blob, aad) {
      const d = createDecipheriv("aes-256-gcm", key, blob.subarray(0, 12));
      d.setAAD(Buffer.from(aad));
      d.setAuthTag(blob.subarray(12, 28));
      return JSON.parse(Buffer.concat([d.update(blob.subarray(28)), d.final()]).toString("utf8"));
    },
  };
}

/** `CONNECTOR_SECRET_KEY`: 32 байта в base64. Нет или не тот размер — `null`. */
function readSecretKey(value) {
  if (typeof value !== "string" || !value) return null;
  const buf = Buffer.from(value, "base64");
  return buf.length === 32 ? buf : null;
}

const str = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : "");

/** Ответ площадки целиком, но не больше предела: огромная выгрузка не кладёт сервер. */
async function readLimited(res) {
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_RESPONSE) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.length > MAX_RESPONSE ? null : buf;
}

function createConnectors({ auth, send, log, secretKey, fetchImpl = fetch }) {
  const { withSession, readJson } = auth;
  const sealer = createSealer(secretKey);
  const perOrg = createRateLimit({ capacity: 60, refillPerMinute: 60 });
  const perAccount = createRateLimit({ capacity: 20, refillPerMinute: 20 });
  const aad = (orgId, id) => `${orgId}:${id}`;

  /** Сессия с правом на интеграции; иначе ответ уже отправлен и `null`. */
  async function session(req, res, fn) {
    const out = await withSession(req, async (c, ctx) =>
      ctx.can(PERM) ? { value: await fn(c, ctx) } : { denied: true },
    );
    if (!out) return (send(res, 401, { ok: false }), null);
    if (out.denied) return (send(res, 403, { ok: false, error: "forbidden" }), null);
    return out;
  }

  async function list(req, res) {
    const out = await session(req, res, async (c) => {
      const r = await c.query(
        `SELECT id, system, label, params, created_at FROM uklad.connector_accounts
         WHERE deleted_at IS NULL ORDER BY created_at`,
      );
      return r.rows.map((x) => ({
        id: x.id,
        system: x.system,
        label: x.label,
        clientId: x.params?.clientId ?? null,
        partnerId: x.params?.partnerId ?? null,
        createdAt: x.created_at,
      }));
    });
    if (out) send(res, 200, { ok: true, connections: out.value });
  }

  async function save(req, res) {
    const b = await readJson(req, res, 8192);
    if (!b) return;
    if (!sealer) return send(res, 503, { ok: false, error: "not_configured" });
    const system = SYSTEMS[b.system] ? b.system : null;
    const label = str(b.label, 100);
    const token = str(b.token, 4000);
    const clientId = str(b.clientId, 64);
    const partnerId = str(b.partnerId, 64);
    if (!system || !label || !token) return send(res, 400, { ok: false, error: "bad_input" });
    if (SYSTEMS[system].needsClientId && !/^[A-Za-z0-9_-]{1,64}$/.test(clientId))
      return send(res, 400, { ok: false, error: "bad_input" });
    if (partnerId && !/^[A-Za-z0-9_-]{1,64}$/.test(partnerId))
      return send(res, 400, { ok: false, error: "bad_input" });
    const out = await session(req, res, async (c, ctx) => {
      const id = (await c.query("SELECT gen_random_uuid() AS id")).rows[0].id;
      await c.query(
        `INSERT INTO uklad.connector_accounts (id, org_id, system, label, params, secret, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          id,
          ctx.orgId,
          system,
          label,
          { ...(clientId ? { clientId } : {}), ...(partnerId ? { partnerId } : {}) },
          sealer.seal({ token }, aad(ctx.orgId, id)),
          ctx.accountId,
        ],
      );
      return id;
    });
    if (out) send(res, 200, { ok: true, id: out.value });
  }

  async function remove(req, res) {
    const b = await readJson(req, res, 1024);
    if (!b) return;
    if (typeof b.id !== "string" || !ID_RE.test(b.id)) return send(res, 400, { ok: false });
    const out = await session(req, res, async (c) => {
      // В корзину, а ключ затираем сразу: удалённое подключение к площадке не ходит.
      const r = await c.query(
        `UPDATE uklad.connector_accounts SET deleted_at = now(), secret = $2
         WHERE id = $1 AND deleted_at IS NULL`,
        [b.id, randomBytes(29)],
      );
      return r.rowCount;
    });
    if (out) send(res, out.value ? 200 : 404, { ok: out.value > 0 });
  }

  async function proxy(req, res, system) {
    const b = await readJson(req, res, 512 * 1024);
    if (!b) return;
    if (!sealer) return send(res, 503, { ok: false, error: "not_configured" });
    if (b.system !== system || !allowed(system, b.method, b.path))
      return send(res, 403, { ok: false, error: "not_allowed" });
    if (typeof b.account !== "string" || !ID_RE.test(b.account))
      return send(res, 400, { ok: false });
    const qs = queryString(b.query);
    if (qs === null) return send(res, 400, { ok: false });
    const out = await session(req, res, async (c, ctx) => {
      const r = await c.query(
        `SELECT id, params, secret FROM uklad.connector_accounts
         WHERE id = $1 AND system = $2 AND deleted_at IS NULL`,
        [b.account, system],
      );
      return r.rows[0] ? { row: r.rows[0], orgId: ctx.orgId } : null;
    });
    if (!out) return;
    if (!out.value) return send(res, 404, { ok: false, error: "no_connection" });
    const { row, orgId } = out.value;
    if (!perOrg.take(orgId) || !perAccount.take(row.id))
      return send(res, 429, { ok: false }, { "Retry-After": "30" });

    const s = SYSTEMS[system];
    let key;
    try {
      key = sealer.open(row.secret, aad(orgId, row.id));
    } catch {
      log.error("[uklad] подключение: ключ не расшифровался", row.id);
      return send(res, 500, { ok: false });
    }
    const params = row.params ?? {};
    const path = s.path ? s.path(b.path, params) : b.path;
    try {
      const upstream = await fetchImpl(`${s.base}${path}${qs}`, {
        method: b.method,
        headers: {
          Accept: "application/json, application/pdf",
          ...(b.body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...s.headers(key, params),
        },
        body: b.body !== undefined ? JSON.stringify(b.body) : undefined,
        redirect: "error",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const buf = await readLimited(upstream);
      if (!buf) return send(res, 502, { ok: false, error: "too_large" });
      // Отказ площадки — 502 с причиной, а не её 401: иначе кабинет решил бы,
      // что кончилась сессия Уклада, и выкинул человека на вход.
      if (!upstream.ok) {
        const st = upstream.status;
        const error =
          st === 401 || st === 403 ? "rejected" : st === 429 ? "rate_limit" : "upstream";
        // Текст отказа площадки (у Ozon `message`, у WB `title`/`detail`) — без
        // заголовков и ключа: по нему человек на экране поймёт, что не так.
        let detail = "";
        try {
          const j = JSON.parse(buf.toString("utf8"));
          const m = j?.message ?? j?.detail ?? j?.title ?? j?.error?.message ?? j?.errorText;
          if (typeof m === "string") detail = m.slice(0, 200);
        } catch {
          // не JSON — хватит кода
        }
        log.error("[uklad] площадка отказала:", system, b.method, b.path, st, detail);
        return send(res, 502, { ok: false, error, status: st, detail });
      }
      const type = upstream.headers.get("content-type") ?? "";
      // Бинарное (PDF этикеток) — в поле `file`, как ждут адаптеры.
      if (buf.length && !type.includes("json"))
        return send(res, 200, { ok: true, data: { file: buf.toString("base64") } });
      let data = null;
      try {
        data = buf.length ? JSON.parse(buf.toString("utf8")) : null;
      } catch {
        return send(res, 502, { ok: false, error: "upstream" });
      }
      return send(res, 200, { ok: true, data });
    } catch (err) {
      log.error("[uklad] подключение:", system, err.name);
      return send(res, 502, { ok: false, error: "upstream" });
    }
  }

  async function handle(req, res, url) {
    const p = url.pathname;
    if (p !== "/api/connectors" && !p.startsWith("/api/connectors/")) return false;
    if (p === "/api/connectors" && req.method === "GET") await list(req, res);
    else if (p === "/api/connectors/save" && req.method === "POST") await save(req, res);
    else if (p === "/api/connectors/delete" && req.method === "POST") await remove(req, res);
    else {
      const m = /^\/api\/connectors\/([a-z-]{1,30})\/proxy$/.exec(p);
      if (!m || req.method !== "POST" || !SYSTEMS[m[1]]) send(res, 404, { ok: false });
      else await proxy(req, res, m[1]);
    }
    return true;
  }

  return { handle };
}

module.exports = { createConnectors, allowed, queryString, createSealer, readSecretKey };
