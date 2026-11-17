/**
 * Работы склада у стола (миграция 046, `deskOps.js`).
 *
 * Работа — задание на операцию, которую система сама не видит: маркировка,
 * переупаковка, фото, своя услуга склада (`tasks` кабинета). Руководитель
 * заводит её в кабинете, а сотрудник за столом берёт и закрывает — двумя
 * операциями, а не правкой снимка:
 *
 * - `task_take` — взять: работа становится «в работе» и записывается на того,
 *   кто за столом. Назначенную другому взять нельзя — переназначает
 *   руководитель. Свободную может взять любой, у кого есть право.
 * - `task_done` — сделал: работа закрыта, время закрытия — дата услуги в счёте
 *   продавцу. Можно сразу, без «взять». Сколько сделали, сотрудник может
 *   уменьшить, но не увеличить: больше заданного в счёт не уйдёт без
 *   руководителя.
 *
 * Право — «делать» в разделе, к которому относится вид работы (как раздел
 * «смотреть» в `viewerAreas.js`). Своя услуга склада — любое право стола.
 * Остатки работа не двигает.
 */

/* global module, require */
/* eslint-disable @typescript-eslint/no-require-imports */

const { TASK_AREAS } = require("./viewerAreas");
const { may } = require("./deskPerms");

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v.filter(isObject) : []);
const ID_RE = /^[A-Za-z0-9_:-]{1,100}$/;
const MAX_QTY = 100_000;

/** Раздел «смотреть» → право «делать» в нём. */
const DO_PERM = {
  "receiving.view": "receiving.do",
  "picking.view": "picking.do",
  "packing.view": "packing.do",
  "shipping.view": "shipping.do",
  "inventory.view": "inventory.count",
};
const ANY_DESK = ["receiving.do", "picking.do", "packing.do", "shipping.do"];

/** Какие права подходят для работы этого вида. */
function taskPerms(kind) {
  const areas = TASK_AREAS[kind];
  return areas ? areas.map((a) => DO_PERM[a]).filter(Boolean) : ANY_DESK;
}

function findTask(data, body) {
  if (typeof body.taskId !== "string" || !ID_RE.test(body.taskId)) return { flag: "bad" };
  const tasks = list(data.tasks);
  const task = tasks.find((t) => t.id === body.taskId);
  if (!task) return { flag: "bad" };
  return { tasks, task };
}

const allowed = (who, staffRef, task) => taskPerms(task.kind).some((p) => may(who, staffRef, p));

/** Чужая: назначена другому или уже взята другим. */
const foreign = (task, staffRef) =>
  typeof task.staffId === "string" && task.staffId !== "" && task.staffId !== staffRef;

const put = (data, tasks, task, next) => ({
  data: { ...data, tasks: tasks.map((t) => (t === task ? next : t)) },
});

function applyTaskTake(data, body, staffRef, who) {
  const found = findTask(data, body);
  if (found.flag) return found;
  const { tasks, task } = found;
  if (!allowed(who, staffRef, task)) return { flag: "not_yours" };
  // Повтор той же операции: работа уже наша и в работе.
  if (task.status === "in_progress" && task.staffId === staffRef) return { data };
  if (task.status !== "open") return { flag: "closed" };
  if (foreign(task, staffRef)) return { flag: "taken" };
  return put(data, tasks, task, {
    ...task,
    status: "in_progress",
    staffId: staffRef,
    startedAt: body.at,
  });
}

function applyTaskDone(data, body, staffRef, who) {
  const found = findTask(data, body);
  if (found.flag) return found;
  const { tasks, task } = found;
  if (!allowed(who, staffRef, task)) return { flag: "not_yours" };
  // Повтор: уже закрыта этим же человеком в это же время.
  if (task.status === "done" && task.staffId === staffRef && task.doneAt === body.at) {
    return { data };
  }
  if (task.status !== "open" && task.status !== "in_progress") return { flag: "closed" };
  if (foreign(task, staffRef)) return { flag: "taken" };
  let qty = Number(task.qty) || 1;
  if (body.qty !== undefined) {
    if (!Number.isInteger(body.qty) || body.qty < 1 || body.qty > MAX_QTY) return { flag: "bad" };
    // Больше заданного — только руководитель: это деньги продавца.
    if (body.qty > qty) return { flag: "bad" };
    qty = body.qty;
  }
  return put(data, tasks, task, {
    ...task,
    status: "done",
    staffId: staffRef,
    qty,
    startedAt: task.startedAt ?? body.at,
    doneAt: body.at,
  });
}

module.exports = { applyTaskTake, applyTaskDone, taskPerms };
