import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorState } from "../../store/state";
import type { StorePort } from "../repository";

/**
 * Продавец на сервере: заявку пишет сервер (`POST /api/requests`), а не стор.
 * Ошибка здесь — заявка, которая «создалась» только в браузере продавца, или
 * сырой отказ сервера вместо понятной фразы.
 */
const apiRequest = vi.fn();
vi.mock("../api", async (orig) => ({
  ...(await orig<typeof import("../api")>()),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));
const resyncDesk = vi.fn(async () => {});
vi.mock("../../store/serverSync", () => ({ resyncDesk: () => resyncDesk() }));

const { createRequestsRepository } = await import("../requestsRepository");

function port(source: "server" | "local", role: "seller" | "warehouse") {
  const createRequests = vi.fn(() => ["req-local"]);
  const reserveRequest = vi.fn(() => "exp-1");
  const state = {
    session: { source, user: { role } },
    requests: [],
    createRequests,
    reserveRequest,
  } as unknown as EditorState;
  const p: StorePort = { get: () => state, set: () => {} };
  return { repo: createRequestsRepository(p), createRequests, reserveRequest };
}

const line = { productId: "p-1", qty: 2.4, note: " Коледино ", vehicle: "А123" };

beforeEach(() => {
  apiRequest.mockReset();
  resyncDesk.mockClear();
});

describe("заявка продавца через сервер", () => {
  it("уходит на сервер «что и сколько» с ключом повтора, стор не трогает", async () => {
    const { repo, createRequests } = port("server", "seller");
    apiRequest.mockResolvedValue({
      status: 200,
      body: { ok: true, requests: [{ id: "req_s1", productId: "p-1", qty: 2, status: "new" }] },
    });
    const res = await repo.create([line], 1_800_000_000_000);
    expect(res).toEqual({ ok: true, data: ["req_s1"] });
    expect(createRequests).not.toHaveBeenCalled();
    const [method, path, body] = apiRequest.mock.calls[0];
    expect([method, path]).toEqual(["POST", "/requests"]);
    expect(body).toMatchObject({
      items: [{ productId: "p-1", qty: 2 }],
      note: "Коледино",
      vehicle: "А123",
      truckDate: 1_800_000_000_000,
    });
    expect(body.key).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    expect(resyncDesk).toHaveBeenCalledOnce();
  });

  it("отказ сервера — ключ словаря, копия не обновляется", async () => {
    const { repo } = port("server", "seller");
    apiRequest.mockResolvedValue({ status: 409, body: { ok: false, error: "short", free: 1 } });
    expect(await repo.create([line])).toEqual({ ok: false, error: "seller.err.short" });
    apiRequest.mockResolvedValue({ status: 402, body: { ok: false, error: "plan_unpaid" } });
    expect(await repo.create([line])).toEqual({ ok: false, error: "plan.err.unpaid" });
    apiRequest.mockResolvedValue({ status: 404, body: { ok: false, error: "not_found" } });
    expect(await repo.create([line])).toEqual({ ok: false, error: "seller.err.notMine" });
    apiRequest.mockResolvedValue({ status: 429, body: { ok: false, error: "rate" } });
    expect(await repo.create([line])).toEqual({ ok: false, error: "seller.err.rate" });
    expect(resyncDesk).not.toHaveBeenCalled();
  });

  it("бронь под поставку продавцу на сервере не нужна: заявка ждёт обычным порядком", async () => {
    const { repo, reserveRequest } = port("server", "seller");
    expect(await repo.reserve("req_s1")).toEqual({ ok: true, data: null });
    expect(reserveRequest).not.toHaveBeenCalled();
  });

  it("склад и демо пишут заявку в стор, как раньше", async () => {
    for (const [source, role] of [
      ["server", "warehouse"],
      ["local", "seller"],
    ] as const) {
      const { repo, createRequests } = port(source, role);
      expect(await repo.create([line])).toEqual({ ok: true, data: ["req-local"] });
      expect(createRequests).toHaveBeenCalledOnce();
    }
    expect(apiRequest).not.toHaveBeenCalled();
  });
});

describe("отмена своей заявки продавцом через сервер", () => {
  it("отмена уходит на сервер, другие статусы продавцу закрыты", async () => {
    const { repo } = port("server", "seller");
    apiRequest.mockResolvedValue({ status: 200, body: { ok: true, request: {} } });
    expect(await repo.setStatus("req_s1", "cancelled")).toEqual({ ok: true, data: undefined });
    expect(apiRequest.mock.calls[0].slice(0, 3)).toEqual([
      "POST",
      "/requests/cancel",
      { id: "req_s1" },
    ]);
    expect(resyncDesk).toHaveBeenCalledOnce();
    expect(await repo.setStatus("req_s1", "done")).toEqual({ ok: false, error: "data.failed" });
  });

  it("начатую сборщиком отменяет склад — понятный отказ", async () => {
    const { repo } = port("server", "seller");
    apiRequest.mockResolvedValue({ status: 409, body: { ok: false, error: "started" } });
    expect(await repo.setStatus("req_s1", "cancelled")).toEqual({
      ok: false,
      error: "seller.err.started",
    });
  });
});

describe("«Везу товар» продавца через сервер", () => {
  it("поставка уходит на сервер с ключом повтора, стор не трогает", async () => {
    const { createFulfillmentRepository } = await import("../fulfillmentRepository");
    const createExpectedShipment = vi.fn(() => "ship-local");
    const state = {
      session: { source: "server", user: { role: "seller" } },
      createExpectedShipment,
    } as unknown as EditorState;
    const repo = createFulfillmentRepository({ get: () => state, set: () => {} });
    apiRequest.mockResolvedValue({
      status: 200,
      body: {
        ok: true,
        supply: { id: "ship_s1", source: "manual", status: "pending", createdAt: 1, lines: [] },
      },
    });
    const res = await repo.createShipment(
      "manual",
      [{ productId: "p-1", expectedQty: 40 }],
      " П1 ",
    );
    expect(res).toEqual({ ok: true, data: "ship_s1" });
    expect(createExpectedShipment).not.toHaveBeenCalled();
    const [, path, body] = apiRequest.mock.calls[0];
    expect(path).toBe("/supplies");
    expect(body).toMatchObject({ title: "П1", items: [{ productId: "p-1", qty: 40 }] });
    apiRequest.mockResolvedValue({ status: 404, body: { ok: false, error: "not_found" } });
    expect(await repo.createShipment("manual", [{ productId: "p-2", expectedQty: 1 }])).toEqual({
      ok: false,
      error: "seller.err.notMine",
    });
  });
});
