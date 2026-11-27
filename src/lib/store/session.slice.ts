import { nowMs, uid } from "../utils";
import { OWNER_PERM } from "../permModules";
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

/**
 * Владелец компании — единственный, кому видны все склады (Кирилл 24.11):
 * список складов, логотип «Все склады», реквизиты и тариф. Начальник склада,
 * старший, продавец после входа сразу в своём складе. Демо — всегда владелец;
 * сессия без прав (старая, до первого ответа сервера) — тоже: экран не
 * прячет, чужих складов в ней всё равно нет, их не отдаёт сервер.
 */
export const selectIsOwner = (s: { session: Session }): boolean =>
  s.session.source !== "server" ||
  !s.session.permissions ||
  s.session.permissions.includes(OWNER_PERM);

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
  sessionLost: (email) =>
    set((s) => ({
      session: {
        ...s.session,
        source: undefined,
        ...(email ? { user: { ...s.session.user, email }, resumeHere: true } : {}),
      },
      appView: "login",
      selection: [],
      activeShelf: null,
    })),

  startServerSession: (email, role, orgId, permissions, partnerId) => {
    const resumeHere = get().session.resumeHere === true;
    set((s) => ({
      session: {
        user: { ...s.session.user, id: orgId, email },
        token: "cookie",
        startedAt: nowMs(),
        source: "server",
        orgId,
        ...(permissions ? { permissions } : {}),
      },
    }));
    get().setRole(role);
    // Руководитель отвязал стол паролем — он в том же складе, где стол стоял.
    if (resumeHere && role === "warehouse") get().goToEditor();
    // Продавец склада: партнёр — из учётной записи на сервере (миграция 039),
    // а не первый в списке, как в демо.
    if (role === "seller" && partnerId) {
      set((s) => ({ session: { ...s.session, user: { ...s.session.user, partnerId } } }));
    }
  },
});
