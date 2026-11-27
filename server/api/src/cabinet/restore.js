/**
 * Загрузить резервную копию в кабинет с сервером (Кирилл 27.11: «почему нет
 * загрузки копии в аккаунт? экспорт есть, а импорта нет»).
 *
 * Без сервера копия просто ложится в браузер. С сервером она заменяет кабинет
 * компании, и обычная запись (`POST /api/cabinet/snapshot`) её не пропустит:
 * она нарочно отказывает, когда пропадает много товаров или записей разом
 * (`products_mass_delete`, `records_mass_delete`) — это защита от пустого
 * стора и старой вкладки. Здесь замена намеренная, поэтому отдельный маршрут
 * со своими условиями:
 *
 * - **Только владелец** (`org.manage`), вошедший паролем. Руководитель склада
 *   копию всей компании не грузит.
 * - **Не во время смены.** Пока у кого-то открыта смена, столы пишут
 *   операции, и остатки на сервере разошлись бы с полками. Открытая смена —
 *   последняя отметка «начал смену» без «закончил» за последние
 *   `SHIFT_WINDOW_H` часов (забытая неделю назад смена не держит загрузку
 *   закрытой навсегда). Отказ — 409 `shift_open`.
 * - **Люди, склады и партнёры не удаляются.** Удалённый сотрудник забывается
 *   сразу и необратимо (миграция 064, 152-ФЗ), склад уносит с собой людей и
 *   план, партнёр — вход продавца. Поэтому склады, сотрудники и партнёры из
 *   копии заменяют одноимённых, а тех, кого в копии нет, загрузка не трогает.
 *   Работа склада (заявки, приёмка, тара, рейсы, журнал смен), товары и
 *   настройки — из копии; товары, которых в копии нет, уходят в корзину
 *   товаров, а не стираются.
 * - **Архив законченной работы не переписывается**: как и обычная запись,
 *   загрузка только дописывает живые строки (`storeRecords`).
 * - **Откат** — копия текущего кабинета, которую кабинет скачивает человеку
 *   перед загрузкой (`BackupSection`), и ночные копии базы. Отдельной таблицы
 *   «как было» нет: в ней остались бы личные данные людей, удалённых позже.
 * - **Авторство не подделать** («Безопасность» 27.11): копия — файл, его
 *   можно править руками. Решение по спорному, которого в базе нет или оно
 *   другое, ложится с `resolvedBy: "manager"` и `restored: true`; новая или
 *   изменённая отметка смены — с `restored: true`. Экраны пишут «из копии»,
 *   и журнал не покажет, что списал или отработал сотрудник, если этого не
 *   было (`markRestored`).
 * - Загрузка пишется в журнал действий (`cabinet.restore`) и поднимает версию
 *   снимка: открытые кабинеты и столы забирают новый кабинет.
 *
 * Лимит тарифа по складам действует как обычно: копия с лишним складом —
 * 409 `plan_limit`, и ничего не меняется (всё в одной транзакции).
 */
/* global require, module */
/* eslint-disable @typescript-eslint/no-require-imports */
const { createRateLimit } = require("../rateLimit");
const { logAction } = require("./audit");
const { recordMoves, invalidWork } = require("./moves");
const { recordStorage } = require("./storage");
const { splitRecords, storedDoc, loadRecords, storeRecords, hasMarks } = require("./records");
const { splitWarehouses } = require("./warehouses");

/** За сколько часов смотрим отметки смены. */
const SHIFT_WINDOW_H = 16;
/** Загрузка — редкое действие: три в час на компанию, с запасом на ошибку файла. */
const RESTORES_PER_HOUR = 3;

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : []);

/** Есть ли сейчас открытая смена у кого-то в компании. */
async function shiftOpen(c, now = Date.now()) {
  const since = now - SHIFT_WINDOW_H * 60 * 60 * 1000;
  const { rows } = await c.query(
    `SELECT 1 FROM (
       SELECT DISTINCT ON (data->>'staffId') data->>'type' AS t
       FROM uklad.cabinet_records
       WHERE org_id = uklad.current_org() AND domain = 'staffEvents'
         AND deleted_at IS NULL AND archived_at IS NULL
         AND data->>'type' IN ('shift_start', 'shift_end')
         AND jsonb_typeof(data->'at') = 'number' AND (data->>'at')::numeric >= $1
       ORDER BY data->>'staffId', (data->>'at')::numeric DESC
     ) last WHERE t = 'shift_start' LIMIT 1`,
    [since],
  );
  return rows.length > 0;
}

/**
 * Склады копии поверх складов компании. Карточки из копии заменяют
 * одноимённые; сотрудники и партнёры, которых в копии нет, дописываются в
 * конец списка (не удаляются); склады, которых в копии нет, остаются как есть.
 */
function mergeWarehouses(fromCopy, current) {
  const byId = new Map(current.map((w) => [w.id, w]));
  const keepMissing = (mine, theirs) => {
    if (!Array.isArray(mine) || !Array.isArray(theirs)) return mine;
    const have = new Set(mine.filter(isObject).map((x) => x.id));
    return [...mine, ...theirs.filter((x) => isObject(x) && !have.has(x.id))];
  };
  const cards = fromCopy.map((w) => {
    const was = byId.get(w.id);
    if (!was) return w;
    const out = { ...w };
    if ("staff" in w) out.staff = keepMissing(w.staff, was.staff);
    if ("partners" in w) out.partners = keepMissing(w.partners, was.partners);
    return out;
  });
  const inCopy = new Set(fromCopy.map((w) => w.id));
  return [...cards, ...current.filter((w) => !inCopy.has(w.id))];
}

/** Текст значения с ключами по алфавиту: jsonb в базе хранит ключи в своём порядке. */
function canon(v) {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (!isObject(v)) return JSON.stringify(v) ?? "null";
  const keys = Object.keys(v)
    .filter((k) => v[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`;
}

/** Списки, где важно, кто сделал: решения по спорному и отметки смен. */
const AUTHORED = ["disputes", "staffEvents"];

/**
 * Строки копии, которых нет в базе такими же, — с пометкой «из копии».
 * Сравнение с любой строкой базы, в том числе архивной и удалённой: строка,
 * которая уже была ровно такой, — не подделка, её не трогаем.
 */
async function markRestored(c, items) {
  const own = items.filter((i) => AUTHORED.includes(i.d) && isObject(i.data));
  if (own.length === 0) return items;
  const { rows } = await c.query(
    `SELECT warehouse_ref AS w, domain AS d, ref, data FROM uklad.cabinet_records
     WHERE org_id = uklad.current_org() AND domain = ANY($1::text[]) AND ref = ANY($2::text[])`,
    [AUTHORED, own.map((i) => i.ref)],
  );
  const key = (r) => `${r.w}\u0000${r.d}\u0000${r.ref}`;
  const was = new Map(rows.map((r) => [key(r), r.data]));
  return items.map((i) => {
    if (!AUTHORED.includes(i.d) || !isObject(i.data)) return i;
    const prev = was.get(key(i));
    if (i.d === "disputes") {
      if (typeof i.data.resolution !== "string") return i;
      const same =
        isObject(prev) &&
        prev.resolution === i.data.resolution &&
        prev.resolvedBy === i.data.resolvedBy;
      return same ? i : { ...i, data: { ...i.data, resolvedBy: "manager", restored: true } };
    }
    if (isObject(prev) && canon(prev) === canon(i.data)) return i;
    return { ...i, data: { ...i.data, restored: true } };
  });
}

/** Проверка тела: то же, что у записи кабинета целиком, и склад обязателен. */
function badBody(b) {
  return (
    !isObject(b) ||
    !Number.isInteger(b.format) ||
    b.format < 1 ||
    !isObject(b.data) ||
    !isObject(b.data.warehouse) ||
    typeof b.data.warehouse.id !== "string" ||
    ("products" in b.data && !Array.isArray(b.data.products)) ||
    invalidWork(b.data) ||
    hasMarks(b.data)
  );
}

const FORBIDDEN = Symbol("forbidden");
const LIMITED = Symbol("limited");

/**
 * Обработчик `POST /api/cabinet/restore` — { format, data }. Помощники записи
 * (товары, склады под лимитом тарифа) — те же, что у снимка: их передаёт
 * `snapshot.js`.
 */
function createRestore({ withSession, readJson, send, log, maxBytes, helpers }) {
  const { storeProducts, storeWarehousesLimited, allProducts, overLimit, sendLimit } = helpers;
  const restores = createRateLimit({
    capacity: RESTORES_PER_HOUR,
    refillPerMinute: RESTORES_PER_HOUR / 60,
  });

  return async function restore(req, res) {
    const b = await readJson(req, res, maxBytes);
    if (!b) return;
    if (badBody(b)) return send(res, 400, { ok: false, error: "bad_request" });
    const out = await overLimit(
      withSession(req, async (c, ctx) => {
        if (!ctx.accountId || !ctx.can("org.manage")) return FORBIDDEN;
        if (!restores.take(ctx.orgId)) return LIMITED;
        const cur = await c.query(
          `SELECT data FROM uklad.cabinet_snapshots
           WHERE org_id = uklad.current_org() FOR UPDATE`,
        );
        // Кабинета ещё нет — первую запись делает обычный вход, а не загрузка.
        if (!cur.rows[0]) return { conflict: true, error: "restore_empty" };
        if (await shiftOpen(c)) return { conflict: true, error: "shift_open" };

        const { products, ...withoutProducts } = b.data;
        const split = splitRecords(withoutProducts);
        const parts = splitWarehouses(split.doc);
        const { rows: wh } = await c.query(`SELECT uklad.load_warehouses() AS cards`);
        const cards = mergeWarehouses(parts.cards ?? [], wh[0]?.cards ?? []);

        // Прежний кабинет — пока строки ещё старые: по нему журнал движений
        // считает, что прибыло и убыло.
        const before = await loadRecords(c, await storedDoc(c, cur.rows[0].data));
        const { rows } = await c.query(
          `UPDATE uklad.cabinet_snapshots
           SET previous = data, data = $1::jsonb, format = $2, version = version + 1,
               updated_at = now(), updated_by = $3, updated_by_desk = NULL
           WHERE org_id = uklad.current_org()
           RETURNING version`,
          [JSON.stringify(parts.doc), b.format, ctx.memberId],
        );
        await storeProducts(c, b.data, null, log);
        await storeWarehousesLimited(c, ctx, cards);
        const items = await markRestored(c, split.items);
        await storeRecords(c, items, split.slots);
        const after = { ...b.data, products: await allProducts(c) };
        await recordMoves(c, before, after, rows[0].version, { memberId: ctx.memberId });
        await recordStorage(c, after);
        await logAction(c, log, {
          action: "cabinet.restore",
          details: {
            warehouses: list(parts.cards).length,
            records: split.items.length,
            products: list(products).length,
          },
        });
        return { version: rows[0].version };
      }),
    );
    if (out === null) return send(res, 401, { ok: false });
    if (out?.planLimit) return sendLimit(res, out.planLimit);
    if (out === FORBIDDEN) return send(res, 403, { ok: false });
    if (out === LIMITED) return send(res, 429, { ok: false }, { "Retry-After": "1200" });
    if (out.conflict) return send(res, 409, { ok: false, error: out.error ?? "conflict" });
    return send(res, 200, { ok: true, version: out.version });
  };
}

module.exports = { createRestore, mergeWarehouses, markRestored, shiftOpen, SHIFT_WINDOW_H };
