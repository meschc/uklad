/**
 * Операции стола (миграция 015): вместо целого снимка стол шлёт факты.
 *
 * Каждая операция несёт свой ключ повтора. Сервер применяет её к текущему
 * снимку сам, поэтому:
 *   · повтор после обрыва связи не задваивает работу — тот же ключ отвечает
 *     `duplicate`;
 *   · правка руководителя в это же время не отбрасывает работу стола: версии
 *     снимка стол не знает и не должен знать;
 *   · кто сделал, решает сервер (`auth.desk_staff`), а не стол.
 *
 * Физический факт не отклоняется, а помечается (`flagged` с причиной): он
 * хранится в журнале операций, но в снимок не идёт. Отказ всем запросом
 * (400) — только для того, что не похоже на операцию вовсе.
 *
 * Здесь отметки смены, упаковка (`deskPack.js`), сборка (`deskPick.js`) и
 * приёмка (`deskReceive.js`).
 */

/* global module, require, Buffer */
/* eslint-disable @typescript-eslint/no-require-imports */

const { applyPackEvent, applyPackDone } = require("./deskPack");
const { applyPickUnit, applyPickDone } = require("./deskPick");
const {
  applyRecvUnit,
  applyRecvOpen,
  applyRecvPlace,
  applyRecvAttach,
  applyRecvClose,
  applyRecvCargo,
  cargoMade,
} = require("./deskReceive");
const { applyShipRun, applyDisputeResolve } = require("./deskShip");
const { GOODS_DECIDE, may } = require("./deskPerms");

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

const SHIFT_TYPES = new Set([
  "shift_start",
  "shift_end",
  "break_start",
  "break_end",
  "idle_start",
  "idle_end",
]);
const PACK_KINDS = new Set(["pack_event", "pack_done"]);
const PICK_KINDS = new Set(["pick_unit", "pick_done"]);
const RECV_KINDS = new Set([
  "recv_open",
  "recv_unit",
  "recv_place",
  "recv_attach",
  "recv_close",
  "recv_cargo",
]);
const SHIP_KINDS = new Set(["ship_run", "dispute_resolve"]);
const NOW_ONLY = new Set(["dispute_resolve"]);
/** Какое право роли нужно операции (миграция 024). */
const OP_PERM = new Map([
  ...[...PACK_KINDS].map((k) => [k, "packing.do"]),
  ...[...PICK_KINDS].map((k) => [k, "picking.do"]),
  ...[...RECV_KINDS].map((k) => [k, "receiving.do"]),
  ["ship_run", "shipping.do"],
  ["dispute_resolve", GOODS_DECIDE],
]);
/** Работа с товаром: правка снимка проходит сверку остатков. */
const WORK = new Map([
  ["pack_event", applyPackEvent],
  ["pack_done", applyPackDone],
  ["pick_unit", applyPickUnit],
  ["pick_done", applyPickDone],
  ["recv_open", applyRecvOpen],
  ["recv_unit", applyRecvUnit],
  ["recv_place", applyRecvPlace],
  ["recv_attach", applyRecvAttach],
  ["recv_close", applyRecvClose],
  ["recv_cargo", applyRecvCargo],
  ["ship_run", applyShipRun],
  ["dispute_resolve", applyDisputeResolve],
]);
const KINDS = new Set([
  "shift_mark",
  "shift_undo",
  ...PACK_KINDS,
  ...PICK_KINDS,
  ...RECV_KINDS,
  ...SHIP_KINDS,
]);
/**
 * Окно отмены по часам сервера: как в кабинете (`MARK_UNDO_MS`) плюс запас
 * на сеть. Отмена, застрявшая в очереди дольше, помечается.
 */
const UNDO_MS = 5_000 + 2_000;
/** Расхождение часов стола и сервера, которое ещё не считается «задним числом». */
const SKEW_MS = 2 * 60 * 1000;
/** Сколько операция может пролежать в очереди устройства. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_AHEAD_MS = 5 * 60 * 1000;
const KEY_RE = /^[A-Za-z0-9_-]{8,100}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,100}$/;

/** Похоже ли это на операцию. Нет — весь запрос 400. */
function isOp(op) {
  return (
    isObject(op) &&
    typeof op.key === "string" &&
    KEY_RE.test(op.key) &&
    KINDS.has(op.kind) &&
    isObject(op.body) &&
    Number.isFinite(op.body.at)
  );
}

/**
 * Применить новые операции к снимку.
 *
 * `who` — кто за столом по серверу (`auth.desk_staff_times`), время в мс:
 * { staff, staffSince, prev, prevSince, prevLeft }.
 * `received` — когда сервер принял отметки, которые просят отменить
 * (eventId → мс). Часам стола здесь не верим ни в чём, что меняет часы в
 * зарплате: окно отмены — по приёму на сервере, а отметка не может быть
 * раньше, чем человек встал за стол, и раньше его последней отметки.
 *
 * `verify(before, after)` — общие правила записи стола (`mergeDeskWrite`):
 * правка упаковки проходит через них, `{ ok: false }` — остатки не сошлись.
 */
function applyDeskOps(data, ops, who, now, received = new Map(), verify = null) {
  let state = data;
  let events = Array.isArray(data.staffEvents) ? data.staffEvents : [];
  const results = [];
  let changed = false;
  const shifts = [];
  if (typeof who.staff === "string" && who.staff) {
    shifts.push({ ref: who.staff, from: who.staffSince ?? now, to: Infinity });
  }
  if (typeof who.prev === "string" && who.prev) {
    shifts.push({ ref: who.prev, from: who.prevSince ?? now, to: who.prevLeft ?? now });
  }
  const accepted = new Map(received);
  let staffRef = null;
  const flag = (op, reason) => results.push({ op, status: "flagged", reason, staffRef });
  const lastMark = (ref) =>
    events.reduce(
      (m, e) =>
        isObject(e) && e.staffId === ref && SHIFT_TYPES.has(e.type) && Number(e.at) > m
          ? Number(e.at)
          : m,
      -Infinity,
    );

  for (const op of ops) {
    const { body } = op;
    // Стол называет, чья это отметка; сервер принимает имя, только если этот
    // человек за столом или стоял за ним последние минуты. Иначе отметка
    // Ивана, догнавшая сервер после смены, легла бы на Ольгу.
    const claimed = typeof body.staffId === "string" ? body.staffId : null;
    const shift = claimed ? shifts.find((x) => x.ref === claimed) : shifts[0];
    staffRef = shift?.ref ?? null;
    if (body.at > now + MAX_AHEAD_MS || body.at < now - MAX_AGE_MS) {
      flag(op, "time");
      continue;
    }
    if (!staffRef) {
      flag(op, shifts.length === 0 ? "nobody" : "not_present");
      continue;
    }
    if (typeof body.eventId !== "string" || !ID_RE.test(body.eventId)) {
      flag(op, "bad");
      continue;
    }
    if (WORK.has(op.kind)) {
      // Упаковка, сборка и приёмка — только за время, пока человек стоит за столом.
      if (body.at < shift.from - SKEW_MS || body.at > shift.to + SKEW_MS) {
        flag(op, "backdated");
        continue;
      }
      // Решение старшего — только от того, кто за столом сейчас: младший не
      // может назваться старшим, который только что отошёл.
      if (NOW_ONLY.has(op.kind) && staffRef !== who.staff) {
        flag(op, "not_yours");
        continue;
      }
      // Сотрудник с ролью делает только то, что разрешает роль. Без роли —
      // работа как раньше, но решения по товару нет (это проверяет само
      // решение): иначе стол встал бы у всех, кому роль ещё не назначили.
      const hasRole = Boolean(who.perms && Object.hasOwn(who.perms, staffRef));
      if ((hasRole || op.kind === "dispute_resolve") && !may(who, staffRef, OP_PERM.get(op.kind))) {
        flag(op, "not_yours");
        continue;
      }
      const before = { ...state, staffEvents: events };
      const r = WORK.get(op.kind)(before, body, staffRef, who);
      if (r.flag) {
        flag(op, r.flag);
        continue;
      }
      let next = r.data;
      if (verify && next !== before) {
        const w = verify(before, next);
        if (!w.ok) {
          flag(op, "stock");
          continue;
        }
        next = w.data;
        // Правило, которое знает только запись целиком (кто сейчас за
        // столом): правка прошла сверку, но решение в неё не попало.
        if (r.check && !r.check(next)) {
          flag(op, "not_yours");
          continue;
        }
      }
      if (next !== before) {
        state = next;
        events = Array.isArray(next.staffEvents) ? next.staffEvents : [];
        changed = true;
      }
      results.push({ op, status: "applied", staffRef });
      continue;
    }
    if (op.kind === "shift_mark") {
      if (!SHIFT_TYPES.has(body.type)) {
        flag(op, "bad");
        continue;
      }
      // Та же отметка уже есть (пришла снимком раньше операции) — это она.
      if (events.some((e) => isObject(e) && e.id === body.eventId)) {
        results.push({ op, status: "applied", staffRef });
        continue;
      }
      // Задним числом: раньше, чем человек встал за стол (или позже, чем
      // ушёл), либо раньше его же последней отметки. Не отказ — очередь
      // устройства бывает настоящей, — а пометка: решит руководитель.
      if (
        body.at < shift.from - SKEW_MS ||
        body.at > shift.to + SKEW_MS ||
        body.at < lastMark(staffRef)
      ) {
        flag(op, "backdated");
        continue;
      }
      const reason =
        body.type === "idle_start" && typeof body.reason === "string"
          ? body.reason.slice(0, 50)
          : undefined;
      events = [
        ...events,
        {
          id: body.eventId,
          staffId: staffRef,
          type: body.type,
          at: body.at,
          ...(typeof body.station === "string" ? { station: body.station.slice(0, 20) } : {}),
          ...(reason ? { reason } : {}),
        },
      ];
      accepted.set(body.eventId, now);
      changed = true;
      results.push({ op, status: "applied", staffRef });
      continue;
    }
    // shift_undo: снять свою отметку в первые секунды после того, как её
    // принял сервер.
    const ev = events.find((e) => isObject(e) && e.id === body.eventId);
    if (!ev) {
      // Уже снята или не дошла: снимать нечего, результат тот же.
      results.push({ op, status: "applied", staffRef });
      continue;
    }
    const at = accepted.get(body.eventId);
    const lag = at === undefined ? Infinity : now - at;
    if (ev.staffId !== staffRef || !SHIFT_TYPES.has(ev.type) || lag > UNDO_MS) {
      flag(op, ev.staffId !== staffRef ? "not_yours" : "late");
      continue;
    }
    events = events.filter((e) => e !== ev);
    changed = true;
    results.push({ op, status: "applied", staffRef });
  }
  return { data: changed ? { ...state, staffEvents: events } : data, results, changed };
}

/** Что из присланного хранится в журнале: только известные поля, с пределом длины. */
function cleanBody(body) {
  const out = { at: body.at };
  for (const k of [
    "eventId",
    "staffId",
    "type",
    "station",
    "reason",
    "toteId",
    "productId",
    "orderId",
    "outboundId",
    "outboundCode",
    "code",
    "requestId",
    "boxId",
    "palletId",
    "unitId",
    "shipmentId",
    "lineId",
    "discrepancy",
    "disputeId",
    "resolution",
    "note",
    "vehicle",
  ]) {
    if (typeof body[k] === "string") out[k] = body[k].slice(0, 200);
  }
  // Состав упаковки нужен журналу целиком: по нему разбирают «куда делась
  // штука». Размер ограничен телом запроса.
  for (const k of ["lines", "requestIds", "shortages", "units"]) {
    if (Array.isArray(body[k])) out[k] = body[k];
  }
  if (isObject(body.dispute)) out.dispute = body.dispute;
  if (isObject(body.cell)) out.cell = body.cell;
  if (typeof body.partial === "boolean") out.partial = body.partial;
  if (Number.isInteger(body.ms)) out.ms = body.ms;
  for (const k of ["qty", "pallets", "boxes", "declaredPallets", "declaredBoxes"]) {
    if (Number.isInteger(body[k])) out[k] = body[k];
  }
  return out;
}

/**
 * Принять пачку операций в транзакции стола. Снимок берётся FOR UPDATE: две
 * пачки одного стола (или стол и руководитель) не применяются наложением.
 * Ответ на каждую операцию — в порядке пачки; уже принятый ключ отвечает
 * тем же статусом, что в первый раз, с пометкой `duplicate`.
 * `before` и `version` — версия снимка до и после: стол сдвигает свою, если
 * она была `before`, иначе следующая запись снимка получит конфликт.
 */
async function runDeskOps(c, deskId, ops, who, now, deps = {}) {
  const { rows } = await c.query(
    `SELECT version, data FROM uklad.cabinet_snapshots
     WHERE org_id = uklad.current_org() FOR UPDATE`,
  );
  const cur = rows[0];
  if (!cur) return { conflict: 0 };
  const keys = [...new Set(ops.map((op) => op.key))];
  const seen = await c.query(
    `SELECT op_key, status, reason, kind, body FROM uklad.desk_ops
     WHERE org_id = uklad.current_org() AND desk_id = $2 AND op_key = ANY($1::text[])`,
    [keys, deskId],
  );
  const known = new Map(seen.rows.map((r) => [r.op_key, r]));
  // Внутри пачки ключ тоже может повториться (очередь отправила дважды).
  const fresh = [];
  for (const op of ops) {
    if (known.has(op.key) || fresh.some((f) => f.key === op.key)) continue;
    fresh.push(op);
  }
  // Когда сервер принял отметки, которые просят снять: окно отмены — по нему.
  const undoIds = fresh.filter((op) => op.kind === "shift_undo").map((op) => op.body.eventId);
  const received = new Map();
  if (undoIds.length > 0) {
    const r = await c.query(
      `SELECT body->>'eventId' AS id, max(received_at) AS at FROM uklad.desk_ops
       WHERE org_id = uklad.current_org() AND kind = 'shift_mark' AND status = 'applied'
         AND body->>'eventId' = ANY($1::text[])
       GROUP BY 1`,
      [undoIds.filter((x) => typeof x === "string")],
    );
    for (const row of r.rows) received.set(row.id, new Date(row.at).getTime());
  }
  // Кабинет целиком: каталог — из таблицы товаров (миграция 013), работа
  // склада и журнал смен — со строк (миграция 021). Товары стол не пишет.
  const packing = fresh.some((op) => WORK.has(op.kind));
  const base = deps.load ? await deps.load(c, cur.data) : cur.data;
  const applied = applyDeskOps(base, fresh, who, now, received, deps.verify ?? null);
  // Снимок, который не влезет в лимит, не пишем вовсе — ни снимок, ни журнал
  // операций: стол получает понятный отказ, а не 500.
  const split = applied.changed
    ? deps.split
      ? deps.split(applied.data)
      : { doc: applied.data, items: null }
    : null;
  const payload = split ? JSON.stringify(split.doc) : null;
  if (payload && deps.maxBytes && Buffer.byteLength(payload) > deps.maxBytes) {
    return { tooLarge: true };
  }
  if (applied.results.length > 0) {
    await c.query(
      `INSERT INTO uklad.desk_ops (org_id, op_key, desk_id, staff_ref, kind, body,
         status, reason, happened_at)
       SELECT uklad.current_org(), o.key, $2, o.staff, o.kind, o.body, o.status, o.reason,
         to_timestamp(o.at / 1000.0)
       FROM jsonb_to_recordset($1::jsonb)
         AS o(key text, staff text, kind text, body jsonb, status text, reason text,
              at double precision)`,
      [
        JSON.stringify(
          applied.results.map((r) => ({
            key: r.op.key,
            staff: typeof r.staffRef === "string" ? r.staffRef.slice(0, 100) : null,
            kind: r.op.kind,
            body: cleanBody(r.op.body),
            status: r.status,
            reason: r.reason ?? null,
            at: r.op.body.at,
          })),
        ),
        deskId,
      ],
    );
  }
  let version = cur.version;
  if (applied.changed) {
    const upd = await c.query(
      `UPDATE uklad.cabinet_snapshots
       SET previous = data, data = $1::jsonb, version = version + 1,
           updated_at = now(), updated_by = NULL, updated_by_desk = $2
       WHERE org_id = uklad.current_org()
       RETURNING version`,
      [payload, deskId],
    );
    version = upd.rows[0].version;
    if (split.items && deps.storeRecords) await deps.storeRecords(c, split.items, split.slots);
    if (packing && deps.recordMoves) {
      await deps.recordMoves(c, base, applied.data, version, {
        deskId,
        staffRef: who.staff ?? who.prev,
      });
    }
  }
  const byKey = new Map(applied.results.map((r) => [r.op.key, r]));
  const answered = new Set();
  const results = ops.map((op) => {
    const old = known.get(op.key);
    const first = byKey.get(op.key);
    const duplicate = Boolean(old) || answered.has(op.key);
    answered.add(op.key);
    const reason = old ? old.reason : first.reason;
    const status = old?.status ?? first.status;
    return {
      key: op.key,
      status,
      ...(reason ? { reason } : {}),
      ...(duplicate ? { duplicate: true } : {}),
      // Грузовая приёмка: номера мест выдал сервер, по ним стол печатает
      // ярлыки. Повтор ключа отвечает теми же местами.
      // Повтор ключа отвечает по телу первой операции, а не по присланному:
      // иначе другим eventId можно было бы получить чужие места.
      ...((old ? old.kind : op.kind) === "recv_cargo" && status === "applied"
        ? { made: cargoMade(applied.data, old ? old.body : first.op.body) }
        : {}),
    };
  });
  return {
    results,
    before: cur.version,
    version,
    ...(payload ? { bytes: Buffer.byteLength(payload) } : {}),
  };
}

/**
 * Отметки, снятые операцией за последние сутки: запись снимка от стола,
 * отправленная до отмены, не должна вернуть их обратно.
 */
async function undoneMarks(c) {
  const { rows } = await c.query(
    `SELECT body->>'eventId' AS id FROM uklad.desk_ops
     WHERE org_id = uklad.current_org() AND kind = 'shift_undo' AND status = 'applied'
       AND received_at > now() - interval '1 day'`,
  );
  return new Set(rows.map((r) => r.id));
}

module.exports = { applyDeskOps, isOp, runDeskOps, undoneMarks, MAX_OPS: 50 };
