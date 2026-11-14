/**
 * Запись кабинета по правам роли, а не «всё или ничего».
 *
 * Кто держит «Персонал» (`staff.manage`), видит кабинет целиком и пишет его
 * целиком, как раньше. Остальные члены команды получают кабинет на просмотр
 * (`viewer.js`) и пишут только то, на что у роли есть право: товары — с
 * `products.edit`, план — с `plan.edit`.
 *
 * Разрешённый список, а не запретный: поле, которого здесь нет, такой
 * человек не меняет вовсе. Закрытое смотрящему (`VIEWER_HIDDEN`: реквизиты,
 * цены, ставки, журнал смен) он не получает, значит и записать не может —
 * сервер берёт эти поля из того, что уже лежит в базе. Иначе урезанная
 * копия в браузере затёрла бы цены и ставки пустыми.
 *
 * Строки работы склада (`cabinet_records`) такой роли закрыты: любая — отказ
 * всей записи, а не тихий пропуск, чтобы копия в браузере не разошлась с базой.
 */
/* global module */

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Поле кабинета → права, любое из которых даёт его менять. Только то, где
 * право буквально значит «редактировать»: каталог и план. Работу склада
 * (тара, ячейки, заявки, спорное, документы) роль без «Персонала» делает
 * операциями, как стол, где сервер сверяет движение товара: право «делать
 * приёмку» не значит «править итог приёмки».
 */
const KEY_PERMS = {
  products: ["products.edit"],
  categories: ["products.edit"],
  categoryFields: ["products.edit"],
  fieldValues: ["products.edit"],
  labelTemplates: ["products.edit"],
  templates: ["plan.edit"],
  layoutTemplates: ["plan.edit"],
  addressing: ["plan.edit"],
};

/** Поля склада, которые меняет план (`plan.edit`); остальное — у «Персонала». */
const WAREHOUSE_PLAN = ["floors"];

const allowed = (key, can) => (KEY_PERMS[key] ?? []).some((p) => can(p));

/** Какие поля кабинета этот человек вправе менять. Пусто — только просмотр. */
function writableKeys(can) {
  const keys = Object.keys(KEY_PERMS).filter((k) => allowed(k, can));
  if (can("plan.edit")) keys.push("warehouse");
  return keys;
}

/** Есть строка, которую роль менять не вправе: запись не принимаем целиком. */
function foreignRows(rows, can) {
  return (Array.isArray(rows) ? rows : []).some((r) => !isObject(r) || !allowed(r.d, can));
}

/**
 * Документ, который ляжет в базу: разрешённые поля — из присланного,
 * остальные (и метки строк) — из того, что уже лежит. Товары лежат своей
 * таблицей и пишутся отдельно.
 */
/**
 * `ref` — склад этого человека (миграция 034): план он правит только у
 * своего склада, где бы тот ни лежал в снимке — активным у руководителя или
 * среди остальных. Без `ref` — активный, как раньше.
 */
function mergeScoped(cur, next, can, ref) {
  const base = isObject(cur) ? cur : {};
  const sent = isObject(next) ? next : {};
  const out = { ...base };
  for (const key of Object.keys(KEY_PERMS)) {
    if (key === "products" || !allowed(key, can)) continue;
    // Нет поля в присланном — оставляем, что лежит: копия без категорий не
    // должна их стереть.
    if (key in sent) out[key] = sent[key];
  }
  if (!can("plan.edit") || !isObject(sent.warehouse)) return out;
  const target = ref ?? (isObject(base.warehouse) ? base.warehouse.id : undefined);
  // Прислали план не своего склада — не трогаем ничего.
  if (sent.warehouse.id !== target) return out;
  const withPlan = (w) => {
    const copy = { ...w };
    for (const f of WAREHOUSE_PLAN) if (f in sent.warehouse) copy[f] = sent.warehouse[f];
    return copy;
  };
  if (isObject(base.warehouse) && base.warehouse.id === target) {
    out.warehouse = withPlan(base.warehouse);
  } else if (Array.isArray(base.otherWarehouses)) {
    out.otherWarehouses = base.otherWarehouses.map((w) =>
      isObject(w) && w.id === target ? withPlan(w) : w,
    );
  }
  return out;
}

module.exports = { KEY_PERMS, writableKeys, foreignRows, mergeScoped };
