import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Загрузка копии в кабинет с сервером: архив уходит без секретов подключений
 * и частей устройства, старый формат и отказы сервера — понятным ключом.
 */
const apiRequest = vi.fn();
vi.mock("../api", async (orig) => ({
  ...(await orig<typeof import("../api")>()),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

const { backupRepository } = await import("../backupRepository");
const { PERSIST_VERSION } = await import("../../store");

const archive = (version = PERSIST_VERSION) =>
  JSON.stringify({
    format: "uklad-backup",
    version,
    createdAt: "2026-11-27T10:00:00.000Z",
    state: {
      warehouse: { id: "w1", name: "Склад" },
      integrations: { wb: { enabled: true, token: "секрет" } },
    },
  });

describe("restoreOnServer", () => {
  beforeEach(() => apiRequest.mockReset());

  it("шлёт кабинет без токенов подключений", async () => {
    apiRequest.mockResolvedValue({ status: 200, body: { ok: true, version: 5 } });
    const res = await backupRepository.restoreOnServer(archive());
    expect(res.ok).toBe(true);
    const [method, path, body] = apiRequest.mock.calls[0];
    expect([method, path]).toEqual(["POST", "/cabinet/restore"]);
    expect(body.format).toBe(PERSIST_VERSION);
    expect(body.data.warehouse.id).toBe("w1");
    expect(body.data.integrations.wb.token).toBeUndefined();
  });

  it("старый формат на сервер не уходит", async () => {
    const res = await backupRepository.restoreOnServer(archive(PERSIST_VERSION - 1));
    expect(res).toEqual({ ok: false, error: "backup.err.serverOld" });
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("открытая смена и не владелец — свои ключи", async () => {
    apiRequest.mockResolvedValueOnce({ status: 409, body: { error: "shift_open" } });
    expect(await backupRepository.restoreOnServer(archive())).toEqual({
      ok: false,
      error: "backup.err.shiftOpen",
    });
    apiRequest.mockResolvedValueOnce({ status: 403, body: {} });
    expect(await backupRepository.restoreOnServer(archive())).toEqual({
      ok: false,
      error: "backup.err.ownerOnly",
    });
  });
});
