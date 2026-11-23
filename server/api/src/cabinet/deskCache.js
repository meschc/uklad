/**
 * Строки работы склада в памяти процесса — для операций стола.
 *
 * Каждый скан собирал кабинет компании заново: читал из базы все живые
 * строки (`loadRows`), а это главная цена операции на большом складе
 * (прогон `bench/desk-load.mjs`). Операции компании и так идут по одной под
 * блокировкой снимка, поэтому строки после прошлого скана — ровно строки
 * перед следующим, если между ними никто другой их не трогал.
 *
 * Кто ещё трогает строки, тот поднимает версию снимка (кабинет руководителя,
 * подкачка заказов, стол) или ставит `archive_checked_at` (архив раз в
 * сутки), и все — под той же строкой снимка. Поэтому ключ — эта пара,
 * прочитанная под `FOR UPDATE`: не совпала — строки читаются из базы.
 * Склады, оглавление и товары по-прежнему читаются каждый раз: они
 * маленькие и пишутся мимо версии.
 *
 * Класть в память — только после COMMIT (`put` зовёт `saveOps`): откатанная
 * транзакция иначе оставила бы строки, которых нет в базе. Несколько
 * процессов сервера безопасны: у каждого своя память, ключ сверяется с
 * базой.
 *
 * Память ограничена не только числом компаний, но и числом строк на всех:
 * у API 384 МБ (`deploy/compose.yml`), а живая строка в памяти Node — около
 * 2–3 КБ. Восемь складов по 7 000 живых заявок без предела съели бы
 * половину и уронили процесс по памяти — на всех складах сразу. Сверх
 * предела вытесняются самые давние компании; компания больше всего предела
 * в память не кладётся вовсе и читается из базы, как до памяти: медленнее,
 * но верно.
 */
/* global module */
"use strict";

// Компаний в памяти: кабинет склада на неделю работы — десятки мегабайт.
const MAX_ORGS = 8;
// Строк на все компании: около 100 МБ памяти Node, четверть лимита API.
const MAX_ROWS = 40_000;

/** Ключ строк компании: версия снимка и отметка архива. */
function cacheKey(cur) {
  const at = cur.archive_checked_at;
  return `${cur.version}|${at ? new Date(at).getTime() : ""}`;
}

function createDeskCache(max = MAX_ORGS, maxRows = MAX_ROWS) {
  const byOrg = new Map();
  let total = 0;

  function drop(orgId) {
    const hit = byOrg.get(orgId);
    if (!hit) return;
    total -= hit.rows.length;
    byOrg.delete(orgId);
  }

  /** Строки компании под этим ключом или `null`. */
  function get(orgId, key) {
    const hit = byOrg.get(orgId);
    if (!hit || hit.key !== key) return null;
    // Свежая — в конец очереди на вытеснение.
    byOrg.delete(orgId);
    byOrg.set(orgId, hit);
    return hit.rows;
  }

  /** Строки компании после записанной операции (только после COMMIT). */
  function put(orgId, key, rows) {
    drop(orgId);
    if (rows.length > maxRows) return;
    byOrg.set(orgId, { key, rows });
    total += rows.length;
    while (byOrg.size > max || total > maxRows) drop(byOrg.keys().next().value);
  }

  return { get, put, size: () => byOrg.size, rows: () => total };
}

/** Строки раскладки кабинета (`splitRecords().items`) → строки как из базы. */
function rowsOf(items) {
  return items.map(({ w, d, data }) => ({ w, d, data }));
}

module.exports = { createDeskCache, cacheKey, rowsOf, MAX_ORGS, MAX_ROWS };
