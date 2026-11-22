/**
 * Стол работает на СВОЁМ складе, а не на том, что открыт у руководителя.
 *
 * В снимке компании «активный» склад один на всех (`warehouse`, его работа —
 * в корне), остальные ждут в `otherWarehouses` и `warehouseData[id]`.
 * Руководитель переключил склад — корень снимка стал другим складом. До этого
 * модуля стол «Складской 5» в ту же минуту начинал читать и писать работу
 * «Логопарка»: приёмка ложилась не в тот склад, а сотрудник с бейджем
 * Логопарка мог работать за чужим столом (Кирилл 14.11, вслед за #144).
 *
 * Склад стола — тот, в чьём списке `devices` стоит его устройство: стол
 * заводят на складе (`addDevice`), и id устройства в компании один
 * (`desk_sessions_one_live`). Своей колонки склада у стола нет: снять
 * устройство со склада — и стол перестаёт работать, а не переезжает молча.
 * Не нашли устройство или нашли на двух складах — `null`, сервер отвечает
 * отказом, а не подставляет первый попавшийся склад.
 *
 * Читает стол снимок, собранный на его складе (`focusWarehouse`, тот же, что
 * у смотрящего из #144). Операции применяются к этому же виду, а результат
 * кладётся обратно туда, где склад лежит в снимке компании (`restore`):
 * в корень, если склад сейчас открыт у руководителя, иначе в
 * `warehouseData[id]`. Чужие склады и их работа операции стола не видят.
 */
/* global require, module */
"use strict";
/* eslint-disable @typescript-eslint/no-require-imports */
const { WAREHOUSE_DOMAINS, warehousesOf, focusWarehouse } = require("./viewerPlace");

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : []);

/** Устройства склада: у открытого — в корне, у остальных — в `warehouseData`. */
function devicesOf(data, whId) {
  if (isObject(data.warehouse) && data.warehouse.id === whId) return list(data.devices);
  const saved = isObject(data.warehouseData) ? data.warehouseData[whId] : undefined;
  return isObject(saved) ? list(saved.devices) : [];
}

/**
 * Склад стола по устройству: id склада или `null`. Отключённое в кабинете
 * устройство (`revokedAt`) — уже не стол этого склада.
 */
function deskWarehouse(data, deviceRef) {
  if (!isObject(data) || typeof deviceRef !== "string" || !deviceRef) return null;
  const found = warehousesOf(data).filter((wh) =>
    devicesOf(data, wh.id).some((d) => isObject(d) && d.id === deviceRef && !d.revokedAt),
  );
  return found.length === 1 ? found[0].id : null;
}

/** Сотрудник этого склада: бейдж другого склада за столом не работает. */
function staffHere(focused, staffRef) {
  if (typeof staffRef !== "string" || !staffRef) return false;
  return list(focused?.warehouse?.staff).some((m) => isObject(m) && m.id === staffRef);
}

/** Положить ключ как в `from`: нет там — нет и здесь (без `undefined` в снимке). */
function copyKey(out, from, key) {
  if (key in from) out[key] = from[key];
  else delete out[key];
}

/**
 * Снимок компании после работы стола: `after` — вид склада `ref`
 * (`focusWarehouse`) после операций, `full` — снимок компании до них.
 * Склады компании, открытый склад и работа других складов — из `full`;
 * работа склада стола — из `after`, туда, где этот склад лежит. Остальное
 * (журнал смен, размещение товара, счётчики тары) — общее для компании и
 * берётся из `after`: что из него стол вправе менять, решает `mergeDeskWrite`.
 */
function restore(full, after, ref) {
  const out = { ...after };
  for (const key of ["warehouse", "otherWarehouses", "warehouseData", "activeFloorId"]) {
    copyKey(out, full, key);
  }
  if (isObject(full.warehouse) && full.warehouse.id === ref) return out;
  const saved = isObject(full.warehouseData) ? full.warehouseData[ref] : undefined;
  const own = isObject(saved) ? { ...saved } : {};
  for (const key of WAREHOUSE_DOMAINS) {
    copyKey(own, after, key);
    copyKey(out, full, key);
  }
  out.warehouseData = { ...(isObject(full.warehouseData) ? full.warehouseData : {}), [ref]: own };
  return out;
}

/**
 * Склад стола в снимке компании: `{ ref, data, back, staffHere, station }` —
 * id склада, снимок на нём, обратная укладка результата, «сотрудник ли этого
 * склада» и процесс устройства по умолчанию (`devices[].station`; до смены
 * процесса по бейджу старшего стол работает в нём). `null` — склада у стола нет.
 */
function deviceStation(data, deviceRef) {
  const dev = list(data.devices).find((d) => isObject(d) && d.id === deviceRef);
  return dev && typeof dev.station === "string" ? dev.station : null;
}

function deskPlace(full, deviceRef) {
  const ref = deskWarehouse(full, deviceRef);
  const data = ref ? focusWarehouse(full, ref) : null;
  if (!data) return null;
  return {
    ref,
    data,
    back: (after) => restore(full, after, ref),
    staffHere: (staffRef) => staffHere(data, staffRef),
    station: deviceStation(data, deviceRef),
  };
}

module.exports = { deskWarehouse, deskPlace, staffHere, restore };
