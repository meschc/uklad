/**
 * Операции стола: сервер сам кладёт отметку смены в снимок и сам решает, за
 * кого. Ошибка здесь видна только в зарплате через неделю: лишняя отметка
 * выглядит как настоящая, пропавшая — как прогул.
 */
/* global require */
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { applyDeskOps, isOp } = require("../src/cabinet/deskOps");

const NOW = 1_800_000_000_000;
const mark = (key, eventId, type, at = NOW - 1000, extra = {}) => ({
  key,
  kind: "shift_mark",
  body: { eventId, type, at, station: "pack", ...extra },
});
const undo = (key, eventId, at = NOW) => ({ key, kind: "shift_undo", body: { eventId, at } });
const ivan = { staff: "stf-ivan", prev: null };
const statuses = (r) => r.results.map((x) => [x.op.key, x.status, x.reason ?? null]);

test("отметка ложится за того, кто за столом по серверу", () => {
  const r = applyDeskOps({ staffEvents: [] }, [mark("k-000001", "ev1", "shift_start")], ivan, NOW);
  assert.equal(r.changed, true);
  assert.deepEqual(r.data.staffEvents, [
    { id: "ev1", staffId: "stf-ivan", type: "shift_start", at: NOW - 1000, station: "pack" },
  ]);
});

test("стол называет сотрудника: принимается, только если он за столом или был", () => {
  const both = { staff: "stf-olga", prev: "stf-ivan" };
  const r = applyDeskOps(
    {},
    [
      mark("k-000001", "ev1", "shift_end", NOW - 1000, { staffId: "stf-ivan" }),
      mark("k-000002", "ev2", "shift_start", NOW - 500, { staffId: "stf-olga" }),
      mark("k-000003", "ev3", "shift_start", NOW - 400, { staffId: "stf-boss" }),
    ],
    both,
    NOW,
  );
  assert.deepEqual(statuses(r), [
    ["k-000001", "applied", null],
    ["k-000002", "applied", null],
    ["k-000003", "flagged", "not_present"],
  ]);
  assert.deepEqual(
    r.data.staffEvents.map((e) => [e.id, e.staffId]),
    [
      ["ev1", "stf-ivan"],
      ["ev2", "stf-olga"],
    ],
  );
});

test("та же отметка, уже пришедшая снимком, не задваивается", () => {
  const had = { id: "ev1", staffId: "stf-ivan", type: "shift_start", at: NOW - 1000 };
  const r = applyDeskOps(
    { staffEvents: [had] },
    [mark("k-000001", "ev1", "shift_start")],
    ivan,
    NOW,
  );
  assert.equal(r.changed, false);
  assert.deepEqual(statuses(r), [["k-000001", "applied", null]]);
});

test("никого за столом, чужое время и не отметка — помечаются, а не ложатся", () => {
  const r1 = applyDeskOps({}, [mark("k-000001", "ev1", "shift_start")], {}, NOW);
  assert.deepEqual(statuses(r1), [["k-000001", "flagged", "nobody"]]);
  assert.equal(r1.changed, false);

  const r2 = applyDeskOps(
    {},
    [
      mark("k-000002", "ev2", "shift_start", NOW + 10 * 60_000),
      mark("k-000003", "ev3", "shift_start", NOW - 2 * 86_400_000),
      mark("k-000004", "ev4", "pack_item"),
      mark("k-000005", "e v5", "shift_start"),
    ],
    ivan,
    NOW,
  );
  assert.deepEqual(statuses(r2), [
    ["k-000002", "flagged", "time"],
    ["k-000003", "flagged", "time"],
    ["k-000004", "flagged", "bad"],
    ["k-000005", "flagged", "bad"],
  ]);
  assert.equal(r2.changed, false);
});

test("прежний сотрудник ещё принимается: очередь догоняет после его ухода", () => {
  const r = applyDeskOps({}, [mark("k-000001", "ev1", "break_start")], { prev: "stf-olga" }, NOW);
  assert.equal(r.data.staffEvents[0].staffId, "stf-olga");
});

test("причина простоя только у начала простоя", () => {
  const r = applyDeskOps(
    {},
    [
      mark("k-000001", "ev1", "idle_start", NOW - 2000, { reason: "no_work" }),
      mark("k-000002", "ev2", "idle_end", NOW - 1000, { reason: "no_work" }),
    ],
    ivan,
    NOW,
  );
  assert.equal(r.data.staffEvents[0].reason, "no_work");
  assert.equal("reason" in r.data.staffEvents[1], false);
});

test("отмена: своя в первые секунды снимается, поздняя и чужая — нет", () => {
  const events = [
    { id: "ev1", staffId: "stf-ivan", type: "break_start", at: NOW - 3000 },
    { id: "ev2", staffId: "stf-olga", type: "break_start", at: NOW - 1000 },
    { id: "ev3", staffId: "stf-ivan", type: "shift_start", at: NOW - 60_000 },
    { id: "ev4", staffId: "stf-ivan", type: "pack_item", at: NOW - 500 },
  ];
  // Когда сервер принял каждую: окно отмены считается по этому, а не по часам стола.
  const received = new Map([
    ["ev1", NOW - 3000],
    ["ev2", NOW - 1000],
    ["ev3", NOW - 60_000],
    ["ev4", NOW - 500],
  ]);
  const r = applyDeskOps(
    { staffEvents: events },
    [
      undo("k-000001", "ev1"),
      undo("k-000002", "ev2"),
      undo("k-000003", "ev3"),
      undo("k-000004", "ev4"),
      undo("k-000005", "gone"),
    ],
    ivan,
    NOW,
    received,
  );
  assert.deepEqual(statuses(r), [
    ["k-000001", "applied", null],
    ["k-000002", "flagged", "not_yours"],
    ["k-000003", "flagged", "late"],
    ["k-000004", "flagged", "late"],
    ["k-000005", "applied", null],
  ]);
  assert.deepEqual(
    r.data.staffEvents.map((e) => e.id),
    ["ev2", "ev3", "ev4"],
  );
});

test("отметка и её отмена в одной пачке — отметки нет", () => {
  const r = applyDeskOps(
    {},
    [mark("k-000001", "ev1", "break_start", NOW - 2000), undo("k-000002", "ev1", NOW - 1000)],
    ivan,
    NOW,
  );
  assert.deepEqual(r.data.staffEvents, []);
});

test("isOp: что не похоже на операцию, отклоняет весь запрос", () => {
  assert.equal(isOp(mark("k-000001", "ev1", "shift_start")), true);
  assert.equal(isOp(mark("short", "ev1", "shift_start")), false);
  assert.equal(isOp({ ...mark("k-000001", "ev1", "shift_start"), kind: "pack" }), false);
  assert.equal(isOp({ key: "k-000001", kind: "shift_mark", body: { at: "1" } }), false);
  assert.equal(isOp({ key: "k-000001", kind: "shift_mark", body: [] }), false);
  assert.equal(isOp(null), false);
});

test("отмена по часам стола не проходит: окно — от приёма на сервере", () => {
  // Отметку сервер принял 20 часов назад; стол пишет, что отменяет через секунду.
  const events = [{ id: "ev1", staffId: "stf-ivan", type: "shift_end", at: NOW - 72_000_000 }];
  const r = applyDeskOps(
    { staffEvents: events },
    [undo("k-000001", "ev1", NOW - 72_000_000 + 1000)],
    ivan,
    NOW,
    new Map([["ev1", NOW - 72_000_000]]),
  );
  assert.deepEqual(statuses(r), [["k-000001", "flagged", "late"]]);
  // Отметка пришла снимком, когда сервер её принял — неизвестно: тоже поздно.
  const r2 = applyDeskOps({ staffEvents: events }, [undo("k-000002", "ev1")], ivan, NOW);
  assert.deepEqual(statuses(r2), [["k-000002", "flagged", "late"]]);
});

test("задним числом: раньше, чем встал за стол, или раньше своей отметки — пометка", () => {
  const at = { staff: "stf-ivan", staffSince: NOW - 3_600_000 };
  const r = applyDeskOps(
    { staffEvents: [{ id: "e0", staffId: "stf-ivan", type: "shift_start", at: NOW - 600_000 }] },
    [
      mark("k-000001", "ev1", "shift_start", NOW - 23 * 3_600_000),
      mark("k-000002", "ev2", "break_start", NOW - 900_000),
      mark("k-000003", "ev3", "break_start", NOW - 300_000),
    ],
    at,
    NOW,
  );
  assert.deepEqual(statuses(r), [
    ["k-000001", "flagged", "backdated"],
    ["k-000002", "flagged", "backdated"],
    ["k-000003", "applied", null],
  ]);

  // Прежний сотрудник — только за время, пока стоял за столом.
  const left = { staff: "stf-olga", staffSince: NOW - 60_000, prev: "stf-ivan" };
  Object.assign(left, { prevSince: NOW - 3_600_000, prevLeft: NOW - 60_000 });
  const r2 = applyDeskOps(
    {},
    [
      mark("k-000004", "ev4", "shift_end", NOW - 90_000, { staffId: "stf-ivan" }),
      mark("k-000005", "ev5", "break_start", NOW - 1000, { staffId: "stf-ivan" }),
    ],
    left,
    NOW,
  );
  assert.deepEqual(statuses(r2), [
    ["k-000004", "applied", null],
    ["k-000005", "applied", null],
  ]);
  const r3 = applyDeskOps(
    {},
    [mark("k-000006", "ev6", "break_start", NOW + 60_000 + 1000, { staffId: "stf-ivan" })],
    { ...left, prevLeft: NOW - 3 * 60_000 },
    NOW,
  );
  assert.deepEqual(statuses(r3), [["k-000006", "flagged", "backdated"]]);
});
