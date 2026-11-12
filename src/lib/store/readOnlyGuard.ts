import type { StoreApi } from "zustand";
import type { EditorState } from "./state";

/**
 * Режим просмотра (`session.readOnly`): роль без «Персонала» смотрит кабинет,
 * но не меняет его. Сервер запись всё равно не примет (снимок пишет только
 * `staff.manage`), а здесь правка компании не ложится и в стор — иначе
 * человек видел бы «сохранено», которого нет нигде, кроме его браузера.
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
    const kept: Record<string, unknown> = {};
    let dropped = false;
    for (const [k, v] of Object.entries(next)) {
      if (
        locked.has(k) &&
        !DEVICE_KEYS.has(k) &&
        v !== (s as unknown as Record<string, unknown>)[k]
      ) {
        dropped = true;
      } else kept[k] = v;
    }
    set(kept as Partial<EditorState>);
    if (dropped) s.showToast("sync.readOnly");
  }) as SetState;
}
