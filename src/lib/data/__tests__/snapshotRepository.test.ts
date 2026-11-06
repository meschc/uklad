import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Ответы сервера снимка → итог записи. Перепутать «конфликт» с «сбоем» —
 * значит молча затереть чужую правку или вечно повторять обречённую запись.
 */
async function load() {
  vi.resetModules();
  vi.stubEnv("VITE_API_URL", "/api");
  const api = await import("../api");
  const repo = await import("../snapshotRepository");
  return { ...api, ...repo };
}

const reply = (status: number, body: unknown = {}) =>
  vi.fn().mockResolvedValue({ status, json: () => Promise.resolve(body) });

describe("snapshotRepository", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("запись: новая версия, конфликт с версией сервера, слишком большой, сбой", async () => {
    const { snapshotRepository } = await load();
    vi.stubGlobal("fetch", reply(200, { ok: true, version: 3 }));
    expect(await snapshotRepository.save(2, 8, {})).toEqual({ ok: true, data: { saved: 3 } });
    vi.stubGlobal("fetch", reply(409, { ok: false, error: "conflict", version: 5 }));
    expect(await snapshotRepository.save(2, 8, {})).toEqual({ ok: true, data: { conflict: 5 } });
    vi.stubGlobal("fetch", reply(413));
    expect(await snapshotRepository.save(2, 8, {})).toMatchObject({ error: "sync.err.tooBig" });
    // Не руководитель: снимок не для этой роли, повторять бессмысленно.
    vi.stubGlobal("fetch", reply(403));
    expect(await snapshotRepository.save(2, 8, {})).toMatchObject({ error: "sync.err.forbidden" });
    expect(await snapshotRepository.load()).toMatchObject({ error: "sync.err.forbidden" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    expect(await snapshotRepository.save(2, 8, {})).toMatchObject({ error: "sync.err.network" });
  });

  it("чтение: пусто — null; компания уходит заголовком", async () => {
    const { snapshotRepository, setApiOrg } = await load();
    const fetch = reply(200, { ok: true, snapshot: null });
    vi.stubGlobal("fetch", fetch);
    setApiOrg("org-1");
    expect(await snapshotRepository.load()).toEqual({ ok: true, data: null });
    expect(fetch.mock.calls[0][1].headers["X-Uklad-Org"]).toBe("org-1");
    setApiOrg(null);

    vi.stubGlobal(
      "fetch",
      reply(200, { ok: true, snapshot: { version: 2, format: 8, data: { warehouse: {} } } }),
    );
    expect(await snapshotRepository.load()).toEqual({
      ok: true,
      data: { version: 2, format: 8, data: { warehouse: {} } },
    });
  });
});
