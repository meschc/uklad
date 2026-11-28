import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorState } from "../../store/state";
import type { ChatMessage } from "../../types";
import type { StorePort } from "../repository";

/**
 * Продавец на сервере: сообщение в ленту кладёт сервер (`/api/seller-chat/*`),
 * а не стор. Ошибка здесь — сообщение, которое «ушло» только в браузере
 * продавца (стор продавца на сервере запись всё равно отбросит).
 */
const apiRequest = vi.fn();
vi.mock("../api", async (orig) => ({
  ...(await orig<typeof import("../api")>()),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));
const resyncDesk = vi.fn(async () => {});
vi.mock("../../store/serverSync", () => ({ resyncDesk: () => resyncDesk() }));

const { createChatRepository } = await import("../chatRepository");

function port(source: "server" | "local", chat: ChatMessage[] = []) {
  const sendChatMessage = vi.fn();
  const markChatRead = vi.fn();
  const state = {
    session: { source, user: { role: "seller" } },
    chats: { "ptr-1": chat },
    sendChatMessage,
    markChatRead,
  } as unknown as EditorState;
  const p: StorePort = { get: () => state, set: () => {} };
  return { repo: createChatRepository(p), sendChatMessage, markChatRead };
}

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockResolvedValue({ status: 200, body: { ok: true } });
  resyncDesk.mockClear();
});

describe("переписка продавца через сервер", () => {
  it("отправка уходит на сервер с ключом повтора, стор не трогает", async () => {
    const { repo, sendChatMessage } = port("server");
    const res = await repo.send("ptr-1", " Когда приёмка? ", "m-1", { kind: "other" });
    expect(res).toEqual({ ok: true, data: undefined });
    expect(sendChatMessage).not.toHaveBeenCalled();
    const [method, path, body] = apiRequest.mock.calls[0];
    expect([method, path]).toEqual(["POST", "/seller-chat/send"]);
    expect(body).toMatchObject({
      text: "Когда приёмка?",
      replyTo: "m-1",
      topic: { kind: "other" },
    });
    expect(body.key).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    expect(resyncDesk).toHaveBeenCalledOnce();
  });

  it("отказ сервера — ключ словаря", async () => {
    const { repo } = port("server");
    apiRequest.mockResolvedValue({ status: 409, body: { ok: false, error: "not_yours" } });
    expect(await repo.edit("ptr-1", "m-1", "x")).toEqual({
      ok: false,
      error: "seller.err.notYours",
    });
    expect(apiRequest.mock.calls[0][1]).toBe("/seller-chat/edit");
  });

  it("прочитано — на сервер, только когда есть непрочитанное от склада", async () => {
    const quiet = port("server", [{ id: "m-1", from: "seller", text: "a", at: 1 }]);
    await quiet.repo.markRead("ptr-1");
    expect(apiRequest).not.toHaveBeenCalled();
    const waiting = port("server", [{ id: "m-2", from: "warehouse", text: "b", at: 2 }]);
    await waiting.repo.markRead("ptr-1");
    expect(apiRequest.mock.calls[0][1]).toBe("/seller-chat/read");
    expect(waiting.markChatRead).not.toHaveBeenCalled();
  });

  it("в демо — по-прежнему стор", async () => {
    const { repo, sendChatMessage } = port("local");
    await repo.send("ptr-1", "a");
    expect(sendChatMessage).toHaveBeenCalledOnce();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
