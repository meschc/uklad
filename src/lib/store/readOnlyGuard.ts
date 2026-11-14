import type { StoreApi } from "zustand";
import type { EditorState } from "./state";

/**
 * Режим просмотра (`session.readOnly`): роль без «Персонала» смотрит кабинет,
 * но не меняет его. Сервер запись всё равно не примет (снимок пишет только
 * `staff.manage`), а здесь правка компании не ложится и в стор — иначе
 * человек видел бы «сохранено», которого нет нигде, кроме его браузера.
 *
 * Роль с правами на часть модулей (`session.writable`, список даёт сервер)
 * меняет только эти поля; у склада — только план (`floors`): остальное в нём
 * (персонал, продавцы) сервер у такой роли всё равно не примет.
 *
 * Одно место на весь стор, а не проверка в каждой команде: новая команда не
 * забудет её. Своё устройства (вход, смена у стола, тема, выделение, зум)
 * пишется как обычно — это не данные компании.
 */
const DEVICE_KEYS = new Set([
  "session",
  "thisDeviceId",
  "stationSession",
  "packSession",
  "seenHints",
  "profile",
  // Какой этаж открыт — просмотр, а не правка.
  "activeFloorId",
]);

type SetState = StoreApi<EditorState>["setState"];

/** У склада изменился только план. */
function onlyPlan(next: unknown, cur: unknown): boolean {
  if (!next || !cur || typeof next !== "object" || typeof cur !== "object") return false;
  const a = next as Record<string, unknown>;
  const b = cur as Record<string, unknown>;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((k) => k === "floors" || a[k] === b[k]);
}

function mayChange(key: string, v: unknown, cur: unknown, writable: ReadonlySet<string>) {
  if (!writable.has(key)) return false;
  return key !== "warehouse" || onlyPlan(v, cur);
}

export function guardReadOnly(
  set: SetState,
  get: () => EditorState,
  companyKeys: () => ReadonlySet<string>,
): SetState {
  return ((partial: unknown, replace?: boolean) => {
    const s = get();
    if (!s?.session?.readOnly || replace)
      return (set as (p: unknown, r?: boolean) => void)(partial, replace);
    const next = (typeof partial === "function" ? partial(s) : partial) as Partial<EditorState>;
    if (!next) return;
    const locked = companyKeys();
    const writable = new Set(s.session.writable ?? []);
    const kept: Record<string, unknown> = {};
    let dropped = false;
    for (const [k, v] of Object.entries(next)) {
      const cur = (s as unknown as Record<string, unknown>)[k];
      if (locked.has(k) && !DEVICE_KEYS.has(k) && v !== cur && !mayChange(k, v, cur, writable)) {
        dropped = true;
      } else kept[k] = v;
    }
    set(kept as Partial<EditorState>);
    if (dropped) s.notify("info", "sync.readOnly");
  }) as SetState;
}
