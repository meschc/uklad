import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Ответы сервера входа → ключи словаря. Ошибается молча: неверный ключ
 * выглядит как обычный отказ, а человек читает «нет связи» вместо «не тот
 * пароль». Адрес сервера задаётся при сборке, поэтому модуль грузится после
 * подмены окружения.
 */
async function load() {
  vi.resetModules();
  vi.stubEnv("VITE_API_URL", "/api");
  return import("../authRepository");
}

function reply(status: number, body: unknown = {}) {
  return vi.fn().mockResolvedValue({ status, json: () => Promise.resolve(body) });
}

describe("authRepository", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("вход: верный пароль, неподтверждённая почта, неверный пароль", async () => {
    const { authRepository } = await load();
    vi.stubGlobal("fetch", reply(200, { ok: true }));
    expect(await authRepository.login("a@b.ru", "x".repeat(10))).toEqual({
      ok: true,
      data: "signedIn",
    });
    vi.stubGlobal("fetch", reply(403, { ok: false, error: "email_unverified" }));
    expect(await authRepository.login("a@b.ru", "x".repeat(10))).toEqual({
      ok: true,
      data: "unverified",
    });
    vi.stubGlobal("fetch", reply(401, { ok: false, error: "bad_credentials" }));
    expect(await authRepository.login("a@b.ru", "x".repeat(10))).toEqual({
      ok: false,
      error: "login.err.badCredentials",
    });
  });

  it("частые попытки и замок — разные слова, сбой сети — свой", async () => {
    const { authRepository } = await load();
    vi.stubGlobal("fetch", reply(429, { ok: false, error: "locked" }));
    expect(await authRepository.login("a@b.ru", "p")).toMatchObject({ error: "login.err.locked" });
    vi.stubGlobal("fetch", reply(429, { ok: false }));
    expect(await authRepository.sendCode("a@b.ru", "reset")).toMatchObject({
      error: "login.err.tooOften",
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(await authRepository.verify("a@b.ru", "123456")).toMatchObject({
      error: "login.err.network",
    });
  });

  it("код из письма и слабый пароль при сбросе", async () => {
    const { authRepository } = await load();
    vi.stubGlobal("fetch", reply(400, { ok: false, error: "bad_code" }));
    expect(await authRepository.verify("a@b.ru", "000000")).toMatchObject({
      error: "login.err.badCode",
    });
    vi.stubGlobal("fetch", reply(400, { ok: false, error: "weak_password" }));
    expect(await authRepository.reset("a@b.ru", "123456", "short")).toMatchObject({
      error: "login.err.weakPassword",
    });
  });

  it("регистрация шлёт согласие и идёт на тот же домен", async () => {
    const { authRepository } = await load();
    const fetch = reply(202, { ok: true });
    vi.stubGlobal("fetch", fetch);
    expect(await authRepository.register("a@b.ru", "x".repeat(10), "seller")).toEqual({
      ok: true,
      data: undefined,
    });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("/api/auth/register");
    expect(init.credentials).toBe("same-origin");
    expect(JSON.parse(init.body)).toMatchObject({ kind: "seller", consent: true });
  });

  it("кто вошёл: нет сессии — null, компания склада — роль склада", async () => {
    const { authRepository, roleOf } = await load();
    vi.stubGlobal("fetch", reply(401, { ok: false }));
    expect(await authRepository.me()).toEqual({ ok: true, data: null });

    const orgs = [
      { id: "o1", name: "Селлер", warehouse: false, seller: true, role: "Владелец" },
      { id: "o2", name: "Склад", warehouse: true, seller: false, role: "Владелец" },
    ];
    vi.stubGlobal("fetch", reply(200, { ok: true, kind: "password", orgs, current: null }));
    const me = await authRepository.me();
    expect(me.ok && roleOf(me.data!)).toEqual({ orgId: "o1", role: "seller" });
    expect(
      roleOf({
        kind: "password",
        orgs,
        current: { orgId: "o2", memberId: "m", warehouseId: null },
      }),
    ).toEqual({ orgId: "o2", role: "warehouse" });
    expect(roleOf({ kind: "password", orgs: [], current: null })).toBeNull();
  });
});
