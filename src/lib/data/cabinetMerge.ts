/**
 * Правка руководителя поверх свежего снимка (трёхстороннее слияние).
 *
 * Сервер принимает правку кабинета только от той версии, что лежит у него.
 * Столы поднимают версию каждым сканом, поэтому правка руководителя во время
 * работы склада почти всегда приходила «от старой версии»: кабинет
 * перезагружался, а правка уходила в отложенную копию. Теперь кабинет берёт
 * свежий снимок и накладывает на него только то, что поменял сам с прошлой
 * версии (`base` → `mine`), а всё, что за это время поменял склад
 * (`base` → `theirs`), остаётся.
 *
 * Правило одно и простое: разные записи (заявки, тары, ячейки, поля) не
 * спорят — ложатся обе правки. Одну и ту же запись поменяли и здесь, и на
 * складе — побеждает склад: скан — это физический факт (товар уже в таре), а
 * правка без скана не может его стереть. Такие места считаются в `lost`,
 * человеку о них говорят.
 *
 * Списки объектов с `id` сливаются по `id`, остальное — по ключам объекта.
 * Сравнение — по значению, без учёта порядка ключей: снимок с сервера
 * проходит через Postgres (`jsonb`), и порядок ключей у него свой.
 */

type Json = unknown;

const isObject = (v: Json): v is Record<string, Json> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/** Равны по значению; порядок ключей объекта не важен. */
export function sameValue(a: Json, b: Json): boolean {
  if (a === b) return true;
  if (Array.isArray(a)) {
    return Array.isArray(b) && a.length === b.length && a.every((x, i) => sameValue(x, b[i]));
  }
  if (isObject(a) && isObject(b)) {
    const ka = Object.keys(a).filter((k) => a[k] !== undefined);
    const kb = Object.keys(b).filter((k) => b[k] !== undefined);
    return ka.length === kb.length && ka.every((k) => sameValue(a[k], b[k]));
  }
  return false;
}

type Item = Record<string, Json> & { id: string };

/** Список объектов с уникальными строковыми `id` — его сливаем по записям. */
function byId(v: Json): Map<string, Item> | null {
  if (!Array.isArray(v)) return null;
  const out = new Map<string, Item>();
  for (const x of v) {
    if (!isObject(x) || typeof x.id !== "string" || out.has(x.id)) return null;
    out.set(x.id, x as Item);
  }
  return out;
}

interface Acc {
  lost: number;
}

function mergeLists(
  b: Map<string, Item>,
  m: Map<string, Item>,
  mList: Item[],
  t: Map<string, Item>,
  tList: Item[],
  acc: Acc,
): Item[] {
  const out: Item[] = [];
  for (const theirs of tList) {
    const id = theirs.id;
    const was = b.get(id);
    const mine = m.get(id);
    if (was === undefined) {
      // Новое на складе; если и здесь завели такую же — склад главнее.
      if (mine !== undefined && !sameValue(mine, theirs)) acc.lost += 1;
      out.push(theirs);
    } else if (mine === undefined) {
      // Здесь убрали. Склад запись не трогал — убираем, трогал — она остаётся.
      if (!sameValue(was, theirs)) {
        acc.lost += 1;
        out.push(theirs);
      }
    } else {
      out.push(merge(was, mine, theirs, acc) as Item);
    }
  }
  for (const [id, was] of b) {
    // Здесь поменяли, а на складе запись убрали: склад главнее.
    const mine = m.get(id);
    if (!t.has(id) && mine !== undefined && !sameValue(was, mine)) acc.lost += 1;
  }
  // Новое здесь — туда же, где оно в своём списке: в начало или в конец.
  const fresh = mList.filter((x) => !b.has(x.id) && !t.has(x.id));
  if (fresh.length === 0) return out;
  const first = mList[0];
  return first !== undefined && !b.has(first.id) ? [...fresh, ...out] : [...out, ...fresh];
}

function merge(b: Json, m: Json, t: Json, acc: Acc): Json {
  if (sameValue(m, b)) return t;
  if (sameValue(t, b) || sameValue(m, t)) return m;
  if (isObject(m) && isObject(t)) {
    const was = isObject(b) ? b : {};
    const out: Record<string, Json> = {};
    for (const k of new Set([...Object.keys(t), ...Object.keys(m)])) {
      const v = merge(was[k], m[k], t[k], acc);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  const lm = byId(m);
  const lt = byId(t);
  if (lm && lt) {
    const lb = byId(b) ?? new Map<string, Item>();
    return mergeLists(lb, lm, m as Item[], lt, t as Item[], acc);
  }
  // Одно и то же значение поменяли и здесь, и на складе — склад главнее.
  acc.lost += 1;
  return t;
}

/**
 * Свежий снимок `theirs` с правками этого кабинета (`mine` против `base`).
 * `lost` — сколько правок не легло, потому что ту же запись поменял склад.
 */
export function mergeCabinet<T extends Record<string, Json>>(
  base: T,
  mine: T,
  theirs: T,
): { data: T; lost: number } {
  const acc: Acc = { lost: 0 };
  const data = merge(base, mine, theirs, acc) as T;
  return { data, lost: acc.lost };
}
