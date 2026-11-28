/**
 * Записать работу одного склада обратно в снимок компании — так пишут
 * сервер сам (подкачка заказов, `orderPull.js`) и операции продавца
 * (`sellerRequests.js`), а не браузер руководителя.
 *
 * Снимок уже взят `FOR UPDATE` в той же транзакции. Версия +1 заставляет
 * кабинеты и столы подтянуть свежее, строки работы склада ложатся как у стола.
 */
/* global module, require, Buffer */
/* eslint-disable @typescript-eslint/no-require-imports */
const { restore } = require("./deskPlace");
const { splitCabinet, MAX_SNAPSHOT_BYTES } = require("./snapshot");
const { storeRecords } = require("./records");

/** Склад `next` (вид `focusWarehouse`) → снимок компании. `null` — записано. */
async function writeView(c, full, next, ref) {
  const split = splitCabinet(restore(full, next, ref));
  const payload = JSON.stringify(split.doc);
  if (Buffer.byteLength(payload) > MAX_SNAPSHOT_BYTES) return { error: "too_large" };
  await c.query(
    `UPDATE uklad.cabinet_snapshots
     SET previous = data, data = $1::jsonb, version = version + 1,
         updated_at = now(), updated_by = NULL, updated_by_desk = NULL
     WHERE org_id = uklad.current_org()`,
    [payload],
  );
  if (split.items) await storeRecords(c, split.items, split.slots);
  return null;
}

module.exports = { writeView };
