import { describe, expect, it } from "vitest";
import { selectIsOwner } from "../session.slice";
import type { Session } from "../../types";

// Список складов и логотип «Все склады» — только владельцу (Кирилл 24.11).
const session = (over: Partial<Session>): { session: Session } => ({
  session: {
    user: { id: "u", email: "a@b.c", role: "warehouse", warehouseId: "wh" },
    token: "cookie",
    startedAt: 0,
    ...over,
  },
});

describe("selectIsOwner", () => {
  it("демо — владелец", () => {
    expect(selectIsOwner(session({}))).toBe(true);
  });
  it("сервер: владелец — по праву org.manage", () => {
    expect(selectIsOwner(session({ source: "server", permissions: ["org.manage"] }))).toBe(true);
  });
  it("начальник склада и продавец — не владельцы", () => {
    expect(selectIsOwner(session({ source: "server", permissions: ["staff.manage"] }))).toBe(false);
    expect(selectIsOwner(session({ source: "server", permissions: [] }))).toBe(false);
  });
  it("сессия без прав (до ответа сервера) экран не прячет", () => {
    expect(selectIsOwner(session({ source: "server" }))).toBe(true);
  });
});
