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
 */
/* global module */
"use strict";

// Компаний в памяти: кабинет склада на неделю работы — десятки мегабайт.
const MAX_ORGS = 8;

/** Ключ строк компании: версия снимка и отметка архива. */
function cacheKey(cur) {
  const at = cur.archive_checked_at;
  return `${cur.version}|${at ? new Date(at).getTime() : ""}`;
}

function createDeskCache(max = MAX_ORGS) {
  const byOrg = new Map();

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
    byOrg.delete(orgId);
    byOrg.set(orgId, { key, rows });
    while (byOrg.size > max) byOrg.delete(byOrg.keys().next().value);
  }

  return { get, put, size: () => byOrg.size };
}

/** Строки раскладки кабинета (`splitRecords().items`) → строки как из базы. */
function rowsOf(items) {
  return items.map(({ w, d, data }) => ({ w, d, data }));
}

module.exports = { createDeskCache, cacheKey, rowsOf, MAX_ORGS };
