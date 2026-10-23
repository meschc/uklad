import {
  isBox,
  isExpectedShipment,
  isPallet,
  isProduct,
  isReceivingEvent,
  isRequest,
  isTask,
  keepValid,
  type Guard,
} from "./guards";

/**
 * Разбор восстановленного состояния (п.0.4): каждый доменный список проходит
 * проверку формы ПЕРЕД тем, как попасть в стор.
 *
 * Раньше единственной защитой было «повезло, что localStorage не испортился».
 * Теперь битая запись одного домена стоит ровно себя: её выкидывают, остальное
 * приложение работает. Домены, которых в проверке нет, проходят как есть —
 * список сознательно короткий, только то, что реально ломает экраны.
 */

/** Домены, которые проверяем: ключ состояния → проверка формы записи. */
const CHECKED: { key: string; guard: Guard<unknown> }[] = [
  { key: "products", guard: isProduct as Guard<unknown> },
  { key: "boxes", guard: isBox as Guard<unknown> },
  { key: "pallets", guard: isPallet as Guard<unknown> },
  { key: "expectedShipments", guard: isExpectedShipment as Guard<unknown> },
  { key: "receivingEvents", guard: isReceivingEvent as Guard<unknown> },
  { key: "requests", guard: isRequest as Guard<unknown> },
  { key: "tasks", guard: isTask as Guard<unknown> },
];

function checkLists(obj: Record<string, unknown>, prefix: string) {
  for (const { key, guard } of CHECKED) {
    if (!(key in obj)) continue;
    obj[key] = keepValid(obj[key], guard, prefix + key).items;
  }
}

export function sanitizeDomains(
  persisted: Record<string, unknown> | undefined | null,
): Record<string, unknown> {
  if (!persisted) return {};
  const out: Record<string, unknown> = { ...persisted };
  checkLists(out, "");
  // Работа неактивных складов (`warehouseData`) проходит те же проверки:
  // иначе битая запись спящего склада уронила бы экран при его открытии.
  const wd = out.warehouseData;
  if (wd !== undefined) {
    if (typeof wd !== "object" || wd === null || Array.isArray(wd)) {
      console.warn("[sanitize] warehouseData: неверная форма, сброшено");
      delete out.warehouseData;
    } else {
      const clean: Record<string, Record<string, unknown>> = {};
      for (const [id, bundle] of Object.entries(wd as Record<string, unknown>)) {
        if (typeof bundle !== "object" || bundle === null) continue;
        const b = { ...(bundle as Record<string, unknown>) };
        checkLists(b, `warehouseData.${id}.`);
        clean[id] = b;
      }
      out.warehouseData = clean;
    }
  }
  // Настройка услуг — не список, а один объект: битая форма заменяется
  // пустой настройкой (значения по умолчанию), а не роняет экран операций.
  if ("serviceSettings" in out) {
    const v = out.serviceSettings as { enabled?: unknown; prices?: unknown } | null;
    const isObj = (x: unknown) => typeof x === "object" && x !== null && !Array.isArray(x);
    if (!isObj(v) || !isObj(v?.enabled) || !isObj(v?.prices)) {
      console.warn("[sanitize] serviceSettings: неверная форма, сброшено");
      delete out.serviceSettings;
    }
  }
  return out;
}
