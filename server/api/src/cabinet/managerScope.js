/**
 * Руководитель склада — только своего склада (Кирилл 22.11: «разные склады
 * связывает только владелец»).
 *
 * Раньше «Персонал» (`staff.manage`) открывал кабинет всей компании: начальник
 * склада Б видел людей, устройства и партнёров склада А и мог их переписать.
 * Теперь весь кабинет — только владельцу (`org.manage`). Руководитель склада
 * получает его вид (`focusWarehouse`), как смотрящий, но целиком, без
 * урезания, и пишет только свой склад: присланное ложится на место его
 * склада, остальные склады и их работа берутся из базы (`restoreManager`).
 * Заводить и удалять склады он не может.
 */
/* global module, require */
/* eslint-disable @typescript-eslint/no-require-imports */
const { placeRef, focusWarehouse } = require("./viewerPlace");
const { restore } = require("./deskPlace");

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Склад руководителя: `null` — владелец, видит всю компанию; строка — id
 * склада; `false` — склад не назначен, а складов несколько: отказ, пока
 * владелец не закрепит его за складом.
 */
function managerRef(ctx, place, data) {
  if (ctx.can("org.manage")) return null;
  const ref = placeRef(data, place?.warehouse_ref);
  return ref && focusWarehouse(data, ref) ? ref : false;
}

/**
 * Кабинет компании после записи руководителя склада `ref`: его склад
 * (карточка и работа) — из присланного, всё остальное о складах — из базы.
 * Чужие склады, прислал он их или нет, не меняются.
 */
function restoreManager(full, after, ref) {
  const out = restore(full, after, ref);
  const card = isObject(after?.warehouse) && after.warehouse.id === ref ? after.warehouse : null;
  if (!card) return out;
  if (isObject(out.warehouse) && out.warehouse.id === ref) return { ...out, warehouse: card };
  return {
    ...out,
    otherWarehouses: (Array.isArray(out.otherWarehouses) ? out.otherWarehouses : []).map((w) =>
      isObject(w) && w.id === ref ? card : w,
    ),
  };
}

/** Прислал склады, кроме своего: завёл новый или тронул чужой — отказ. */
function foreignWarehouses(after, ref) {
  // Заготовка (`placeholder`) тоже склад: ею прячут чужой.
  const all = [
    after?.warehouse,
    ...(Array.isArray(after?.otherWarehouses) ? after.otherWarehouses : []),
  ];
  return all.some((w) => isObject(w) && w.id !== ref);
}

module.exports = { managerRef, restoreManager, foreignWarehouses };
