import {
  isBox,
  isExpectedShipment,
  isPallet,
  isProduct,
  isReceivingEvent,
  isRequest,
  isStaffEvent,
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
  { key: "staffEvents", guard: isStaffEvent as Guard<unknown> },
  { key: "tasks", guard: isTask as Guard<unknown> },
];

export function sanitizeDomains(
  persisted: Record<string, unknown> | undefined | null,
): Record<string, unknown> {
  if (!persisted) return {};
  const out: Record<string, unknown> = { ...persisted };
  for (const { key, guard } of CHECKED) {
    if (!(key in out)) continue;
    out[key] = keepValid(out[key], guard, key).items;
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
