import { nowMs, uid } from "../utils";
import type { Session, UserRole } from "../types";
import type { SessionSlice, SliceCreator } from "./state";

/**
 * Сессия текущего пользователя (п.0.5).
 *
 * Реального входа с паролем здесь НЕТ и в этом пункте не появится: это тот же
 * локальный переключатель роли, что и был, только роль теперь живёт в
 * `session.user`, а не отдельным полем стора. Смысл ровно один — когда придёт
 * Supabase, поменяется способ получения сессии, а не десяток экранов, которые
 * спрашивают «кто я и что мне можно».
 */

/** Мок-токен: локальная строка вместо JWT. В сеть, разумеется, не уходит. */
function mockToken(): string {
  return `local.${uid("tok")}`;
}

export function makeSession(role: UserRole, warehouseId: string): Session {
  return {
    user: {
      id: uid("user"),
      email: role === "seller" ? "seller@uklad.local" : "warehouse@uklad.local",
      role,
      warehouseId,
    },
    token: mockToken(),
    startedAt: nowMs(),
  };
}

/** Роль текущего пользователя — единственный правильный способ её спросить. */
export const selectRole = (s: { session: Session }): UserRole => s.session.user.role;

export const createSessionSlice: SliceCreator<SessionSlice> = (set) => ({
  // Склад проставится при первой же смене роли; на старте важна только роль.
  session: makeSession("warehouse", ""),

  setRole: (role) =>
    set((s) => ({
      session: {
        ...s.session,
        user: { ...s.session.user, role, warehouseId: s.warehouse.id },
      },
      // Экран склада продавцу не показываем и наоборот: уводим на «свой» старт.
      appView: role === "seller" ? "seller" : s.appView === "seller" ? "dashboard" : s.appView,
    })),
});
