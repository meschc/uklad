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
 * Пока здесь отметки смены. Сборка, упаковка и приёмка переедут сюда же по
 * одной, и вместе с последней стол перестанет писать снимок.
 */

/* global module */

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

const SHIFT_TYPES = new Set([
  "shift_start",
  "shift_end",
  "break_start",
  "break_end",
  "idle_start",
  "idle_end",
]);
const KINDS = new Set(["shift_mark", "shift_undo"]);
/** Как в кабинете (`MARK_UNDO_MS`) плюс запас на задержку сети. */
const UNDO_MS = 5_000 + 2_000;
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
 * Применить новые операции к снимку. `who` — кто за столом по серверу:
 * { staff, prev }. Возвращает снимок, ответ на каждую операцию и было ли
 * что менять.
 */
function applyDeskOps(data, ops, who, now) {
  let events = Array.isArray(data.staffEvents) ? data.staffEvents : [];
  const results = [];
  let changed = false;
  const present = [who.staff, who.prev].filter((x) => typeof x === "string" && x);
  let staffRef = null;
  const flag = (op, reason) => results.push({ op, status: "flagged", reason, staffRef });

  for (const op of ops) {
    const { body } = op;
    // Стол называет, чья это отметка; сервер принимает имя, только если этот
    // человек за столом или стоял за ним последние минуты. Иначе отметка
    // Ивана, догнавшая сервер после смены, легла бы на Ольгу.
    const claimed = typeof body.staffId === "string" ? body.staffId : null;
    staffRef = claimed ? (present.includes(claimed) ? claimed : null) : (present[0] ?? null);
    if (body.at > now + MAX_AHEAD_MS || body.at < now - MAX_AGE_MS) {
      flag(op, "time");
      continue;
    }
    if (!staffRef) {
      flag(op, present.length === 0 ? "nobody" : "not_present");
      continue;
    }
    if (typeof body.eventId !== "string" || !ID_RE.test(body.eventId)) {
      flag(op, "bad");
      continue;
    }
    if (op.kind === "shift_mark") {
      if (!SHIFT_TYPES.has(body.type)) {
        flag(op, "bad");
        continue;
      }
      // Та же отметка уже есть (пришла снимком раньше операции) — это она.
      if (!events.some((e) => isObject(e) && e.id === body.eventId)) {
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
        changed = true;
      }
      results.push({ op, status: "applied", staffRef });
      continue;
    }
    // shift_undo: снять свою отметку в первые секунды после неё.
    const ev = events.find((e) => isObject(e) && e.id === body.eventId);
    if (!ev) {
      // Уже снята или не дошла: снимать нечего, результат тот же.
      results.push({ op, status: "applied", staffRef });
      continue;
    }
    const lag = body.at - Number(ev.at);
    if (ev.staffId !== staffRef || !SHIFT_TYPES.has(ev.type) || lag < 0 || lag > UNDO_MS) {
      flag(op, ev.staffId !== staffRef ? "not_yours" : "late");
      continue;
    }
    events = events.filter((e) => e !== ev);
    changed = true;
    results.push({ op, status: "applied", staffRef });
  }
  return { data: changed ? { ...data, staffEvents: events } : data, results, changed };
}

/** Что из присланного хранится в журнале: только известные поля, с пределом длины. */
function cleanBody(body) {
  const out = { at: body.at };
  for (const k of ["eventId", "staffId", "type", "station", "reason"]) {
    if (typeof body[k] === "string") out[k] = body[k].slice(0, 100);
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
async function runDeskOps(c, deskId, ops, who, now) {
  const { rows } = await c.query(
    `SELECT version, data FROM uklad.cabinet_snapshots
     WHERE org_id = uklad.current_org() FOR UPDATE`,
  );
  const cur = rows[0];
  if (!cur) return { conflict: 0 };
  const keys = [...new Set(ops.map((op) => op.key))];
  const seen = await c.query(
    `SELECT op_key, status, reason FROM uklad.desk_ops
     WHERE org_id = uklad.current_org() AND op_key = ANY($1::text[])`,
    [keys],
  );
  const known = new Map(seen.rows.map((r) => [r.op_key, r]));
  // Внутри пачки ключ тоже может повториться (очередь отправила дважды).
  const fresh = [];
  for (const op of ops) {
    if (known.has(op.key) || fresh.some((f) => f.key === op.key)) continue;
    fresh.push(op);
  }
  const applied = applyDeskOps(cur.data, fresh, who, now);
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
      [JSON.stringify(applied.data), deskId],
    );
    version = upd.rows[0].version;
  }
  const byKey = new Map(applied.results.map((r) => [r.op.key, r]));
  const answered = new Set();
  const results = ops.map((op) => {
    const old = known.get(op.key);
    const first = byKey.get(op.key);
    const duplicate = Boolean(old) || answered.has(op.key);
    answered.add(op.key);
    const reason = old ? old.reason : first.reason;
    return {
      key: op.key,
      status: old?.status ?? first.status,
      ...(reason ? { reason } : {}),
      ...(duplicate ? { duplicate: true } : {}),
    };
  });
  return { results, before: cur.version, version };
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

module.exports = { applyDeskOps, isOp, runDeskOps, undoneMarks, MAX_OPS: 100 };
