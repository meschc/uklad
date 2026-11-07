import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Архив с сервера страницами (окно истории). Потерять страницу — значит
 * молча недосчитать отчёт за долгий период.
 */
async function load() {
  vi.resetModules();
  vi.stubEnv("VITE_API_URL", "/api");
  return import("../historyRepository");
}

const row = (ref: string) => ({ w: "w1", d: "requests", ref, pos: 0, data: { id: ref } });

describe("historyRepository", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("идёт по страницам до конца и передаёт ключ следующей", async () => {
    const { historyRepository } = await load();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        json: () => Promise.resolve({ ok: true, rows: [row("r1"), { bad: 1 }], next: "a+b/" }),
      })
      .mockResolvedValueOnce({
        status: 200,
        json: () => Promise.resolve({ ok: true, rows: [row("r2")], next: null }),
      });
    vi.stubGlobal("fetch", fetch);
    const res = await historyRepository.load();
    expect(res).toEqual({ ok: true, data: [row("r1"), row("r2")] });
    expect(String(fetch.mock.calls[0][0])).toBe("/api/cabinet/history");
    expect(String(fetch.mock.calls[1][0])).toBe("/api/cabinet/history?after=a%2Bb%2F");
  });

  it("стол и продавец получают «не положено», сбой — ошибку, а не пустой архив", async () => {
    const { historyRepository } = await load();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 403, json: () => Promise.resolve({}) }),
    );
    expect(await historyRepository.load()).toEqual({ ok: true, data: "forbidden" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 500, json: () => Promise.resolve({}) }),
    );
    expect((await historyRepository.load()).ok).toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect((await historyRepository.load()).ok).toBe(false);
  });
});
