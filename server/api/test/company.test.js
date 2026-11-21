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

// Банк по БИК: тот же справочник, те же правила — только вошедшим, мусор до
// справочника не доходит, ответ — только то, что идёт в реквизиты.
const { isValidBik, pickBank } = require("../src/cabinet/company");
const BIK = "044525225";

async function askBank(lookup, bik) {
  const res = fakeRes();
  await lookup.handle({ method: "POST", body: { bik } }, res, new URL("http://x/api/company/bank"));
  return res;
}

function makeBank({ signedIn = true, reply } = {}) {
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
              value: "ПАО Сбербанк",
              data: {
                bic: BIK,
                name: { payment: "ПАО Сбербанк", short: "Сбербанк" },
                correspondent_account: "30101810400000000225",
                state: { status: "ACTIVE" },
                swift: "SABRRUMM",
              },
            },
          ],
        },
    };
  };
  const lookup = createCompanyLookup({ auth, send, log: { error() {} }, token: "k", fetchImpl });
  return { lookup, calls };
}

test("БИК: 9 цифр с 04", () => {
  assert.equal(isValidBik(BIK), true);
  assert.equal(isValidBik("123456789"), false);
  assert.equal(isValidBik("04452522"), false);
});

test("банк по БИК — название и корсчёт, справочник банков", async () => {
  const { lookup, calls } = makeBank();
  const res = await askBank(lookup, BIK);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.bank, {
    bik: BIK,
    name: "ПАО Сбербанк",
    correspondentAccount: "30101810400000000225",
    status: "ACTIVE",
  });
  assert.match(calls[0].url, /findById\/bank$/);
  assert.deepEqual(JSON.parse(calls[0].init.body), { query: BIK });
});

test("БИК и ИНН кэшируются раздельно", async () => {
  const { lookup, calls } = makeBank();
  await askBank(lookup, BIK);
  await askBank(lookup, BIK);
  assert.equal(calls.length, 1);
});

test("неверный БИК — 400 до справочника, без входа — 401", async () => {
  const { lookup, calls } = makeBank();
  const bad = await askBank(lookup, "123");
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error, "bad_bik");
  const anon = makeBank({ signedIn: false });
  assert.equal((await askBank(anon.lookup, BIK)).status, 401);
  assert.equal(calls.length + anon.calls.length, 0);
});

test("банк не нашёлся — bank: null", async () => {
  const { lookup } = makeBank({ reply: { suggestions: [] } });
  const res = await askBank(lookup, BIK);
  assert.equal(res.body.bank, null);
  assert.equal(pickBank({ bic: BIK }), null);
});
