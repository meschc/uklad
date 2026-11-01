/**
 * Реквизиты по ИНН через сервер: ключ справочника не уходит в браузер,
 * спросить может только вошедший, неверный ИНН до справочника не доходит,
 * один ИНН второй раз квоту не тратит.
 */
/* global require, URL */
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { createCompanyLookup, isValidInn, pick } = require("../src/cabinet/company");

// ИНН с верной контрольной цифрой (Сбербанк).
const INN = "7707083893";

function fakeRes() {
  return {
    status: 0,
    body: null,
    headers: {},
    writeHead(status, headers) {
      this.status = status;
      Object.assign(this.headers, headers);
    },
    end(text) {
      this.body = text ? JSON.parse(text) : null;
    },
  };
}
const send = (res, status, payload, headers = {}) => {
  res.writeHead(status, headers);
  res.end(payload === undefined ? "" : JSON.stringify(payload));
};

function make({ token = "k", signedIn = true, reply } = {}) {
  const calls = [];
  const auth = {
    withSession: async (_req, fn) => (signedIn ? fn(null, { orgId: "org-1" }) : null),
    readJson: async (req) => req.body,
  };
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      json: async () =>
        reply ?? {
          suggestions: [
            {
              data: {
                inn: INN,
                kpp: "773601001",
                ogrn: "1027700132195",
                name: { short_with_opf: 'ПАО "СБЕРБАНК"' },
                address: { unrestricted_value: "117312, г Москва, ул Вавилова, д 19" },
                state: { status: "ACTIVE" },
              },
            },
          ],
        },
    };
  };
  const lookup = createCompanyLookup({ auth, send, log: { error() {} }, token, fetchImpl });
  const ask = async (inn) => {
    const res = fakeRes();
    const handled = await lookup.handle(
      { method: "POST", body: { inn } },
      res,
      new URL("http://x/api/company/lookup"),
    );
    assert.equal(handled, true);
    return res;
  };
  return { ask, calls };
}

test("ИНН проверяется контрольной цифрой", () => {
  assert.equal(isValidInn(INN), true);
  assert.equal(isValidInn("7707083894"), false);
  assert.equal(isValidInn("123"), false);
});

test("вошедший получает реквизиты, ключ уходит только в заголовке справочнику", async () => {
  const { ask, calls } = make();
  const res = await ask(INN);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.company, {
    inn: INN,
    name: 'ПАО "СБЕРБАНК"',
    kpp: "773601001",
    ogrn: "1027700132195",
    legalAddress: "117312, г Москва, ул Вавилова, д 19",
    status: "ACTIVE",
  });
  assert.equal(calls[0].init.headers.Authorization, "Token k");
  assert.equal(JSON.stringify(res.body).includes("Token"), false);
});

test("повторный ИНН берётся из памяти, справочник не трогается", async () => {
  const { ask, calls } = make();
  await ask(INN);
  await ask(INN);
  assert.equal(calls.length, 1);
});

test("без входа — 401, справочник не трогается", async () => {
  const { ask, calls } = make({ signedIn: false });
  assert.equal((await ask(INN)).status, 401);
  assert.equal(calls.length, 0);
});

test("неверный ИНН — 400 до справочника", async () => {
  const { ask, calls } = make();
  assert.equal((await ask("7707083894")).status, 400);
  assert.equal(calls.length, 0);
});

test("без ключа — честный 503", async () => {
  const { ask } = make({ token: "" });
  const res = await ask(INN);
  assert.equal(res.status, 503);
  assert.equal(res.body.error, "not_configured");
});

test("справочник не нашёл — company: null", async () => {
  const { ask } = make({ reply: { suggestions: [] } });
  const res = await ask(INN);
  assert.equal(res.status, 200);
  assert.equal(res.body.company, null);
  assert.equal(pick(undefined), null);
});
