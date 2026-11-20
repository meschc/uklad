/**
 * Реквизиты компании по ИНН — через сервер, а не из браузера.
 *
 * Справочник — DaData («Найти организацию по ИНН», данные ФНС). Ключ живёт
 * только в окружении сервера (`DADATA_API_KEY`): из браузера его пришлось бы
 * положить в бандл, и квоту съел бы кто угодно. Поэтому запрос — только для
 * вошедшего в кабинет, с лимитом на компанию, а ответы держатся в памяти
 * сутки: один и тот же ИНН справочник второй раз не тратит.
 *
 * Без ключа маршрут честно отвечает 503 `not_configured`, и профиль пишет,
 * что справочник не подключён, — ИНН при этом сохраняется.
 *
 * Банк по БИК — тот же справочник и те же правила (`findById/bank`):
 * название банка и корреспондентский счёт для реквизитов в счёте продавцу.
 * Расчётный счёт справочник не знает — его вводит человек.
 *
 * Маршруты:
 *   POST /api/company/lookup — { inn } → { ok, company | null }
 *   POST /api/company/bank   — { bik } → { ok, bank | null }
 */
/* global require, module, fetch, AbortSignal */
/* eslint-disable @typescript-eslint/no-require-imports */
const { createRateLimit } = require("../rateLimit");

const BASE = "https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById";
const DAY_MS = 86_400_000;
const CACHE_MAX = 2000;
const TIMEOUT_MS = 5000;

const COEF_10 = [2, 4, 10, 3, 5, 9, 4, 6, 8];
const COEF_12_1 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
const COEF_12_2 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
const check = (d, k) => (k.reduce((a, c, i) => a + c * d[i], 0) % 11) % 10;

/** ИНН с контрольными цифрами — та же проверка, что в `src/lib/company.ts`. */
function isValidInn(value) {
  if (typeof value !== "string" || !/^(\d{10}|\d{12})$/.test(value)) return false;
  const d = [...value].map(Number);
  if (value.length === 10) return check(d, COEF_10) === d[9];
  return check(d, COEF_12_1) === d[10] && check(d, COEF_12_2) === d[11];
}

/** Из ответа справочника — только то, что показывает профиль. */
function pick(data) {
  if (!data || typeof data !== "object") return null;
  const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  return {
    inn: str(data.inn),
    name: str(data.name?.short_with_opf) ?? str(data.name?.full_with_opf),
    kpp: str(data.kpp),
    ogrn: str(data.ogrn),
    legalAddress: str(data.address?.unrestricted_value) ?? str(data.address?.value),
    // ACTIVE, LIQUIDATING, LIQUIDATED, BANKRUPT, REORGANIZING
    status: str(data.state?.status),
  };
}

/** БИК банка России: 9 цифр, начинается с 04. */
function isValidBik(value) {
  return typeof value === "string" && /^04\d{7}$/.test(value);
}

/** Из ответа справочника банков — только то, что идёт в реквизиты. */
function pickBank(data) {
  if (!data || typeof data !== "object") return null;
  const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const name = str(data.name?.payment) ?? str(data.name?.short) ?? str(data.value);
  if (!name) return null;
  return {
    bik: str(data.bic),
    name,
    correspondentAccount: str(data.correspondent_account),
    status: str(data.state?.status),
  };
}

/** Что и как спрашивать у справочника: ИНН — организации, БИК — банки. */
const KINDS = {
  "/api/company/lookup": {
    field: "inn",
    out: "company",
    valid: isValidInn,
    error: "bad_inn",
    url: `${BASE}/party`,
    query: (inn) => ({ query: inn, branch_type: "MAIN" }),
    pick,
  },
  "/api/company/bank": {
    field: "bik",
    out: "bank",
    valid: isValidBik,
    error: "bad_bik",
    url: `${BASE}/bank`,
    query: (bik) => ({ query: bik }),
    pick: pickBank,
  },
};

function createCompanyLookup({
  auth,
  send,
  log,
  token,
  fetchImpl = fetch,
  now = () => Date.now(),
}) {
  const { withSession, readJson } = auth;
  const perOrg = createRateLimit({ capacity: 20, refillPerMinute: 10 });
  const cache = new Map();

  async function ask(kind, value) {
    const key = `${kind.field}:${value}`;
    const hit = cache.get(key);
    if (hit && hit.until > now()) return hit.found;
    const res = await fetchImpl(kind.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Token ${token}`,
      },
      body: JSON.stringify(kind.query(value)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`справочник ответил ${res.status}`);
    const body = await res.json();
    const found = kind.pick(body?.suggestions?.[0]?.data);
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(key, { found, until: now() + DAY_MS });
    return found;
  }

  async function lookup(kind, req, res) {
    const b = await readJson(req, res, 1024);
    if (!b) return;
    const raw = b[kind.field];
    const value = typeof raw === "string" ? raw.replace(/\D/g, "") : "";
    if (!kind.valid(value)) return send(res, 400, { ok: false, error: kind.error });
    // Справочник — только вошедшим: иначе это бесплатный прокси к чужой квоте.
    const ctx = await withSession(req, async (_c, c) => c);
    if (!ctx) return send(res, 401, { ok: false });
    if (!token) return send(res, 503, { ok: false, error: "not_configured" });
    if (!perOrg.take(ctx.orgId)) {
      return send(res, 429, { ok: false }, { "Retry-After": "30" });
    }
    try {
      return send(res, 200, { ok: true, [kind.out]: await ask(kind, value) });
    } catch (err) {
      log.error("[uklad] справочник компаний:", err.message);
      return send(res, 502, { ok: false, error: "upstream" });
    }
  }

  async function handle(req, res, url) {
    const kind = Object.hasOwn(KINDS, url.pathname) ? KINDS[url.pathname] : null;
    if (!kind || req.method !== "POST") return false;
    await lookup(kind, req, res);
    return true;
  }

  return { handle };
}

module.exports = { createCompanyLookup, isValidInn, isValidBik, pick, pickBank };
