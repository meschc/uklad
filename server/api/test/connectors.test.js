/**
 * Подключения к площадкам через сервер: ключ селлера хранится только
 * шифротекстом и в ответы не попадает, к площадке уходят лишь пути из белого
 * списка, `{campaignId}` подставляет сервер, без права роли — 403.
 */
/* global require, Buffer, URL, Response */
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const {
  createConnectors,
  allowed,
  queryString,
  createSealer,
  readSecretKey,
} = require("../src/cabinet/connectors");

const KEY = randomBytes(32);
const ID = "11111111-2222-4333-8444-555555555555";

function fakeRes() {
  return {
    status: 0,
    body: null,
    raw: "",
    writeHead(status) {
      this.status = status;
    },
    end(text) {
      this.raw = String(text ?? "");
      this.body = this.raw ? JSON.parse(this.raw) : null;
    },
  };
}
const send = (res, status, payload) => {
  res.writeHead(status);
  res.end(payload === undefined ? "" : JSON.stringify(payload));
};

/** Стенд: таблица подключений в памяти, сессия с правом или без. */
function make({ perms = ["integrations.manage"], key = KEY, reply } = {}) {
  const rows = [];
  const calls = [];
  const client = {
    async query(sql, params = []) {
      if (sql.includes("gen_random_uuid")) return { rows: [{ id: ID }] };
      if (sql.startsWith("INSERT")) {
        const [id, , system, label, p, secret] = params;
        rows.push({ id, system, label, params: p, secret, created_at: "t", deleted_at: null });
        return { rowCount: 1 };
      }
      if (sql.includes("UPDATE")) {
        const r = rows.find((x) => x.id === params[0] && !x.deleted_at);
        if (r) Object.assign(r, { deleted_at: "now", secret: params[1] });
        return { rowCount: r ? 1 : 0 };
      }
      const live = rows.filter((x) => !x.deleted_at);
      if (sql.includes("WHERE id = $1"))
        return { rows: live.filter((x) => x.id === params[0] && x.system === params[1]) };
      return { rows: live };
    },
  };
  const auth = {
    withSession: async (_req, fn) =>
      fn(client, { orgId: "org-1", accountId: "acc-1", can: (p) => perms.includes(p) }),
    readJson: async (req) => req.body,
  };
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return reply
      ? reply(url, init)
      : new Response('{"orders":[]}', { headers: { "content-type": "application/json" } });
  };
  const c = createConnectors({ auth, send, log: { error() {} }, secretKey: key, fetchImpl });
  const call = async (method, path, body) => {
    const res = fakeRes();
    await c.handle({ method, body }, res, new URL(`https://u-klad.ru${path}`));
    return res;
  };
  return { call, rows, calls };
}

test("белый список: только известные пути и методы", () => {
  assert.equal(allowed("wildberries", "GET", "/api/v3/orders/new"), true);
  assert.equal(allowed("wildberries", "POST", "/api/v3/orders/new"), false);
  assert.equal(allowed("wildberries", "GET", "/api/v3/orders/new/../../x"), false);
  assert.equal(allowed("wildberries", "GET", "/content/v2/cards"), false);
  assert.equal(allowed("ozon", "POST", "/v2/products/stocks"), true);
  assert.equal(allowed("yandex-market", "GET", "/v2/campaigns/{campaignId}/orders"), true);
  // Чужой номер кампании тем же ключом — нет.
  assert.equal(allowed("yandex-market", "GET", "/v2/campaigns/999/orders"), false);
  assert.equal(allowed("avito", "GET", "/x"), false);
});

test("строка запроса: простые значения, странные ключи отвергаются", () => {
  assert.equal(queryString({ limit: 50, status: "A B" }), "?limit=50&status=A+B");
  assert.equal(queryString(undefined), "");
  assert.equal(queryString({ "a&b": 1 }), null);
  assert.equal(queryString({ a: { b: 1 } }), null);
});

test("ключ шифрования: 32 байта base64, шифр с привязкой к записи", () => {
  assert.equal(readSecretKey(""), null);
  assert.equal(readSecretKey(Buffer.alloc(16).toString("base64")), null);
  assert.ok(readSecretKey(KEY.toString("base64")));
  const s = createSealer(KEY);
  const blob = s.seal({ token: "секрет" }, "org-1:a");
  assert.equal(blob.includes(Buffer.from("секрет")), false);
  assert.deepEqual(s.open(blob, "org-1:a"), { token: "секрет" });
  // Шифротекст из другой компании не открывается.
  assert.throws(() => s.open(blob, "org-2:a"));
});

test("сохранение: в базе шифротекст, в списке ключа нет", async () => {
  const { call, rows } = make();
  const saved = await call("POST", "/api/connectors/save", {
    system: "ozon",
    label: "ИП Иванов",
    clientId: "12345",
    token: "ozon-key-xyz",
  });
  assert.equal(saved.status, 200);
  assert.equal(rows[0].secret.includes(Buffer.from("ozon-key-xyz")), false);
  const list = await call("GET", "/api/connectors");
  assert.equal(list.body.connections[0].clientId, "12345");
  assert.equal(list.raw.includes("ozon-key-xyz"), false);
});

test("без права роли и без ключа окружения — отказ", async () => {
  const body = { system: "wildberries", label: "x", token: "t" };
  assert.equal(
    (await make({ perms: ["stock.view"] }).call("POST", "/api/connectors/save", body)).status,
    403,
  );
  assert.equal((await make({ key: null }).call("POST", "/api/connectors/save", body)).status, 503);
});

test("прокси: ключ в заголовке площадки, campaignId из записи", async () => {
  const { call, calls } = make();
  await call("POST", "/api/connectors/save", {
    system: "yandex-market",
    label: "Маркет",
    clientId: "777",
    token: "ym-key",
  });
  const r = await call("POST", "/api/connectors/yandex-market/proxy", {
    system: "yandex-market",
    account: ID,
    method: "GET",
    path: "/v2/campaigns/{campaignId}/orders",
    query: { status: "PROCESSING" },
  });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true, data: { orders: [] } });
  assert.equal(
    calls[0].url,
    "https://api.partner.market.yandex.ru/v2/campaigns/777/orders?status=PROCESSING",
  );
  assert.equal(calls[0].init.headers["Api-Key"], "ym-key");
  assert.equal(calls[0].init.redirect, "error");
});

test("прокси: чужой путь, чужая система и удалённое подключение не проходят", async () => {
  const { call, calls } = make();
  await call("POST", "/api/connectors/save", { system: "wildberries", label: "WB", token: "wb" });
  const proxy = (system, method, path) =>
    call("POST", `/api/connectors/${system}/proxy`, { system, account: ID, method, path });
  assert.equal((await proxy("wildberries", "GET", "/api/v1/supplier/sales")).status, 403);
  assert.equal((await proxy("ozon", "POST", "/v2/products/stocks")).status, 404);
  await call("POST", "/api/connectors/delete", { id: ID });
  assert.equal((await proxy("wildberries", "GET", "/api/v3/orders/new")).status, 404);
  assert.equal(calls.length, 0);
});

test("прокси: PDF площадки — в поле file, отказ площадки — причиной", async () => {
  const req = {
    system: "ozon",
    account: ID,
    method: "POST",
    path: "/v2/posting/fbs/package-label",
    body: { posting_number: ["1"] },
  };
  const save = { system: "ozon", label: "O", clientId: "1", token: "k" };
  const pdf = make({
    reply: () =>
      new Response(Buffer.from("%PDF-1"), { headers: { "content-type": "application/pdf" } }),
  });
  await pdf.call("POST", "/api/connectors/save", save);
  const r = await pdf.call("POST", "/api/connectors/ozon/proxy", req);
  assert.equal(Buffer.from(r.body.data.file, "base64").toString(), "%PDF-1");

  const denied = make({ reply: () => new Response("{}", { status: 401 }) });
  await denied.call("POST", "/api/connectors/save", save);
  // Не 401: его кабинет принял бы за конец своей сессии.
  const r2 = await denied.call("POST", "/api/connectors/ozon/proxy", req);
  assert.equal(r2.status, 502);
  assert.equal(r2.body.error, "rejected");

  const bad = make({
    reply: () => new Response('{"code":3,"message":"invalid filter"}', { status: 400 }),
  });
  await bad.call("POST", "/api/connectors/save", save);
  const r3 = await bad.call("POST", "/api/connectors/ozon/proxy", req);
  assert.equal(r3.body.error, "upstream");
  assert.equal(r3.body.detail, "invalid filter");
});
