import { nowMs, uid } from "../utils";
import type { Session, UserRole } from "../types";
import type { SessionSlice, SliceCreator } from "./state";

/**
 * Сессия текущего пользователя (п.0.5).
 *
 * Две сессии одной формы. Демо (`setRole`) — локальный переключатель роли без
 * пароля. Сервер (`startServerSession`) — вход паролем: токен в куке `HttpOnly`,
 * роль по компании. Экраны спрашивают «кто я и что мне можно» одинаково
 * (`selectRole`) и не знают, откуда пришла сессия.
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

export const createSessionSlice: SliceCreator<SessionSlice> = (set, get) => ({
  // Склад проставится при первой же смене роли; на старте важна только роль.
  session: makeSession("warehouse", ""),

  setRole: (role) =>
    set((s) => ({
      session: {
        ...s.session,
        user: {
          ...s.session.user,
          role,
          warehouseId: s.warehouse.id,
          // Прототип: входим первым партнёром склада. С сервером партнёр
          // придёт из учётной записи, а не из списка.
          partnerId: role === "seller" ? s.warehouse.partners?.[0]?.id : undefined,
        },
      },
      // Экран склада продавцу не показываем и наоборот: уводим на «свой» старт.
      // Один сценарий для обеих ролей: складов несколько — сначала список, склад
      // один — сразу его рабочий экран (с выходом на главную через логотип).
      appView:
        s.otherWarehouses.length === 0 ? (role === "seller" ? "seller" : "editor") : "dashboard",
    })),

  // Данные кабинета пока в браузере (переезд на сервер — по модулям), поэтому
  // после входа навигация та же, что у демо: `setRole` уводит на «свой» экран.
  sessionLost: () =>
    set((s) => ({
      session: { ...s.session, source: undefined },
      appView: "login",
      selection: [],
      activeShelf: null,
    })),

  startServerSession: (email, role, orgId) => {
    set((s) => ({
      session: {
        user: { ...s.session.user, id: orgId, email },
        token: "cookie",
        startedAt: nowMs(),
        source: "server",
        orgId,
      },
    }));
    get().setRole(role);
  },
});
