/**
 * Работы склада у стола: `task_take` и `task_done` (`deskTasks.js`).
 */

/* global require */
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { applyDeskOps } = require("../src/cabinet/deskOps");
const { applyTaskTake, applyTaskDone, taskPerms } = require("../src/cabinet/deskTasks");

const NOW = 1_800_000_000_000;
const AT = NOW - 1000;
const task = (over = {}) => ({
  id: "task-1",
  kind: "marking",
  status: "open",
  qty: 10,
  createdAt: NOW - 3_600_000,
  ...over,
});
const data = (over) => ({ tasks: [task(over)] });
const WHO = { perms: { ivan: ["receiving.do"], olga: ["packing.do"] } };
const body = (over = {}) => ({ eventId: "e1", taskId: "task-1", at: AT, ...over });

test("право по виду работы: маркировка — приёмка, переупаковка — упаковка, своя — любой стол", () => {
  assert.deepEqual(taskPerms("marking"), ["receiving.do"]);
  assert.deepEqual(taskPerms("repacking"), ["packing.do"]);
  assert.deepEqual(taskPerms("inventory"), ["inventory.count"]);
  assert.equal(taskPerms("custom:photo-manekin").length, 4);
});

test("взять свободную: в работе, на того, кто за столом", () => {
  const r = applyTaskTake(data(), body(), "ivan", WHO);
  assert.equal(r.flag, undefined);
  assert.deepEqual(r.data.tasks[0], {
    ...task(),
    status: "in_progress",
    staffId: "ivan",
    startedAt: AT,
  });
});

test("без права на раздел работы — нельзя", () => {
  assert.equal(applyTaskTake(data(), body(), "olga", WHO).flag, "not_yours");
  assert.equal(applyTaskDone(data(), body(), "olga", WHO).flag, "not_yours");
});

test("назначенную другому не взять и не закрыть", () => {
  const d = data({ staffId: "petr" });
  assert.equal(applyTaskTake(d, body(), "ivan", WHO).flag, "taken");
  assert.equal(applyTaskDone(d, body(), "ivan", WHO).flag, "taken");
});

test("повтор взятия — та же запись, закрытую — не взять", () => {
  const taken = data({ status: "in_progress", staffId: "ivan", startedAt: AT });
  assert.equal(applyTaskTake(taken, body(), "ivan", WHO).data, taken);
  assert.equal(applyTaskTake(data({ status: "done" }), body(), "ivan", WHO).flag, "closed");
});

test("закрыть: дата услуги — время операции, меньше заданного можно, больше — нет", () => {
  const d = data({ status: "in_progress", staffId: "ivan", startedAt: AT - 5000 });
  const r = applyTaskDone(d, body({ qty: 7 }), "ivan", WHO);
  assert.deepEqual(r.data.tasks[0], {
    ...task(),
    status: "done",
    staffId: "ivan",
    qty: 7,
    startedAt: AT - 5000,
    doneAt: AT,
  });
  assert.equal(applyTaskDone(d, body({ qty: 11 }), "ivan", WHO).flag, "bad");
  assert.equal(applyTaskDone(d, body({ qty: 0 }), "ivan", WHO).flag, "bad");
  // Повтор той же операции — без изменений.
  assert.equal(applyTaskDone(r.data, body({ qty: 7 }), "ivan", WHO).data, r.data);
});

test("закрыть сразу, без «взять»", () => {
  const r = applyTaskDone(data(), body(), "ivan", WHO);
  assert.equal(r.data.tasks[0].status, "done");
  assert.equal(r.data.tasks[0].startedAt, AT);
  assert.equal(r.data.tasks[0].qty, 10);
});

test("через очередь стола: работа берётся с любого процесса, неизвестная работа — пометка", () => {
  const who = {
    staff: "ivan",
    staffSince: NOW - 60_000,
    prev: null,
    perms: WHO.perms,
    station: "pack",
  };
  const r = applyDeskOps(
    data(),
    [
      { key: "k-000001", kind: "task_take", body: body() },
      { key: "k-000002", kind: "task_done", body: body({ eventId: "e2", taskId: "nope" }) },
    ],
    who,
    NOW,
  );
  assert.equal(r.results[0].status, "applied");
  assert.equal(r.results[1].reason, "bad");
  assert.equal(r.data.tasks[0].staffId, "ivan");
});
