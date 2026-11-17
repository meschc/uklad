/**
 * Ответ продавца на акт приёмки: срок и разбор тел запросов. Ошибка здесь —
 * ответ на открытую или давно закрытую поставку либо возражение без слов,
 * с которым старшему нечего делать.
 */
/* global require, URL */
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  answerProblem,
  readAnswer,
  readResolve,
  ANSWER_DAYS,
  createReceivingAnswers,
} = require("../src/cabinet/receivingAnswers");

const DAY = 24 * 3_600_000;

test("ответить можно на закрытую поставку, пока не вышли трое суток", () => {
  const closed = { status: "closed", closedAt: 1_000 * DAY };
  assert.equal(answerProblem(closed, 1_000 * DAY + ANSWER_DAYS * DAY), null);
  assert.equal(answerProblem(closed, 1_000 * DAY + ANSWER_DAYS * DAY + 1), "late");
  assert.equal(answerProblem({ status: "receiving" }, 0), "not_closed");
  assert.equal(answerProblem(undefined, 0), "not_found");
});

test("ответ: согласие без слов, возражение — только с комментарием", () => {
  assert.deepEqual(readAnswer({ shipmentId: "exp-1", answer: "agree" }), {
    shipmentId: "exp-1",
    answer: "agree",
    comment: null,
  });
  assert.equal(readAnswer({ shipmentId: "exp-1", answer: "dispute", comment: "  " }), null);
  assert.equal(readAnswer({ shipmentId: "exp-1", answer: "maybe" }), null);
  assert.equal(readAnswer({ shipmentId: "../x", answer: "agree" }), null);
  assert.equal(
    readAnswer({ shipmentId: "exp-1", answer: "dispute", comment: "x".repeat(1001) }),
    null,
  );
});

test("решение старшего: учёт верный или пересчёт, всегда с ответом продавцу", () => {
  const b = { shipmentId: "exp-1", partnerId: "ptr-r" };
  assert.deepEqual(readResolve({ ...b, resolution: "kept", reply: " Верно " }), {
    ...b,
    resolution: "kept",
    reply: "Верно",
  });
  assert.equal(readResolve({ ...b, resolution: "kept", reply: "" }), null);
  assert.equal(readResolve({ ...b, resolution: "drop", reply: "x" }), null);
  // Чьё возражение — обязательно: в поставке бывает товар нескольких продавцов.
  assert.equal(readResolve({ shipmentId: "exp-1", resolution: "kept", reply: "x" }), null);
});

test("отказ продавцу на чужой маршрут — 403, а не сбой", async () => {
  const sent = [];
  const err = Object.assign(new Error("seller"), { httpStatus: 403 });
  const api = createReceivingAnswers({
    auth: {
      withSession: async () => {
        throw err;
      },
      readJson: async () => ({
        shipmentId: "exp-1",
        partnerId: "ptr-r",
        resolution: "kept",
        reply: "верно",
      }),
    },
    send: (_res, status) => sent.push(status),
    log: { error: () => sent.push("logged") },
  });
  const handled = await api.handle(
    { method: "POST" },
    { headersSent: false },
    new URL("http://x/api/receiving/answers/resolve"),
  );
  assert.equal(handled, true);
  assert.deepEqual(sent, [403]);
});
