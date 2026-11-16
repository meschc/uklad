/**
 * Журнал пересчётов за период — основа акта инвентаризации.
 *
 * Отдельной таблицы пересчётов нет (`decisions.md`, «Инвентаризация»): каждый
 * пересчёт с числами лежит строкой журнала операций стола (`desk_ops`,
 * `inv_count` — тара, `inv_cell` — ячейка без тары). Акт собирается из этих
 * строк и спорного в снимке: что насчитали, где, кто и когда; расхождение и
 * решение по нему — из спорного. Только принятые операции: помеченная сервером
 * учёта не коснулась и в акт не идёт.
 *
 * Отдаём руководителю (`staff.manage`): акт — документ склада с числами
 * учёта, слепой пересчёт на столе их не показывает.
 */

/* global module */

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[A-Za-z0-9_.:-]{1,100}$/;
/** Самый длинный период: год с запасом, как у отчёта хранения. */
const MAX_DAYS = 400;
/** Потолок строк в одном ответе: акт за год крупного склада, с запасом. */
const MAX_ROWS = 20_000;

/** Период из запроса; null — неверный. */
function parseLogPeriod(url) {
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if (!DAY_RE.test(from) || !DAY_RE.test(to)) return null;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  if ((b - a) / 86_400_000 > MAX_DAYS) return null;
  return { from, to };
}

const isCell = (a) =>
  isObject(a) &&
  typeof a.floorId === "string" &&
  ID_RE.test(a.floorId) &&
  typeof a.moduleId === "string" &&
  ID_RE.test(a.moduleId) &&
  Number.isInteger(a.shelfIndex) &&
  Number.isInteger(a.cellIndex);

/** Строки пересчёта: только товар и целое число — тело писал стол. */
function countLines(v) {
  if (!Array.isArray(v)) return [];
  return v
    .filter(
      (l) =>
        isObject(l) &&
        typeof l.productId === "string" &&
        ID_RE.test(l.productId) &&
        Number.isInteger(l.qty) &&
        l.qty >= 0,
    )
    .map((l) => ({ productId: l.productId, qty: l.qty }));
}

/** Строка журнала → запись акта; null — тело не похоже на пересчёт. */
function toEntry(row) {
  const body = isObject(row.body) ? row.body : {};
  if (typeof body.eventId !== "string" || !ID_RE.test(body.eventId)) return null;
  const at = Number.isFinite(body.at) ? body.at : new Date(row.at).getTime();
  const entry = {
    kind: row.kind,
    at,
    staff: typeof row.staff_ref === "string" ? row.staff_ref : "",
    eventId: body.eventId,
    lines: countLines(body.lines),
  };
  if (typeof body.boxId === "string" && ID_RE.test(body.boxId)) entry.boxId = body.boxId;
  if (isCell(body.cell)) {
    const { floorId, moduleId, shelfIndex, cellIndex } = body.cell;
    entry.cell = { floorId, moduleId, shelfIndex, cellIndex };
  }
  if (entry.kind === "inv_count" && !entry.boxId) return null;
  if (entry.kind === "inv_cell" && !entry.cell) return null;
  return entry;
}

/** Принятые пересчёты компании за сутки периода (по Москве), по времени. */
async function loadInventoryLog(c, { from, to }) {
  const { rows } = await c.query(
    `SELECT kind, staff_ref, body, coalesce(happened_at, received_at) AS at
     FROM uklad.desk_ops
     WHERE org_id = uklad.current_org()
       AND status = 'applied'
       AND kind IN ('inv_count', 'inv_cell')
       AND coalesce(happened_at, received_at) >= ($1::date::timestamp AT TIME ZONE 'Europe/Moscow')
       AND coalesce(happened_at, received_at) < (($2::date + 1)::timestamp AT TIME ZONE 'Europe/Moscow')
     ORDER BY 4, id
     LIMIT ${MAX_ROWS}`,
    [from, to],
  );
  return rows.map(toEntry).filter(Boolean);
}

module.exports = { parseLogPeriod, loadInventoryLog, toEntry };
