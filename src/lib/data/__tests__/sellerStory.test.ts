import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorState } from "../../store/state";
import type { StorePort } from "../repository";

/**
 * История своего товара у продавца: на сервере — `GET /api/seller/journal`
 * с товаром в адресе, в демо — журнал смен браузера по этому товару.
 */
const apiRequest = vi.fn();
vi.mock("../api", async (orig) => ({
  ...(await orig<typeof import("../api")>()),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

const { createJournalRepository } = await import("../journalRepository");

function port(source: "server" | "local") {
  const state = {
    session: { source, user: { role: "seller" } },
    warehouse: { id: "wh-a" },
    staffEvents: [
      { id: "e1", staffId: "s1", type: "pick_scan", at: 1, productId: "p-1" },
      { id: "e2", staffId: "s1", type: "pick_scan", at: 2, productId: "p-2" },
    ],
  } as unknown as EditorState;
  const p: StorePort = { get: () => state, set: () => {} };
  return createJournalRepository(p);
}

beforeEach(() => apiRequest.mockReset());

describe("история товара продавца", () => {
  it("на сервере — свой маршрут с товаром и границей страницы", async () => {
    apiRequest.mockResolvedValue({
      status: 200,
      body: { ok: true, entries: [{ id: "x", at: 5, kind: "recv_place" }], next: 5 },
    });
    const res = await port("server").productStory("p-1", 10);
    expect(res).toEqual({
      ok: true,
      data: { entries: [{ id: "x", at: 5, kind: "recv_place" }], next: 5 },
    });
    expect(apiRequest.mock.calls[0]).toEqual(["GET", "/seller/journal?product=p-1&before=10"]);
  });

  it("чужой товар — понятный отказ", async () => {
    apiRequest.mockResolvedValue({ status: 404, body: { ok: false, error: "not_found" } });
    expect(await port("server").productStory("p-9")).toEqual({
      ok: false,
      error: "seller.err.notMine",
    });
  });

  it("в демо — только этот товар из журнала смен", async () => {
    const res = await port("local").productStory("p-1");
    expect(res.ok && res.data.entries.map((e) => e.id)).toEqual(["e1"]);
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
