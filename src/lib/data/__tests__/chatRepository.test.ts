import { describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "../../types";
import type { EditorState } from "../../store/state";
import type { StorePort } from "../repository";
import { createChatRepository } from "../chatRepository";

/**
 * Репозиторий переписки через подменённый порт — ни стора, ни `localStorage`.
 *
 * Отдельно проверяется, что лента берётся по собеседнику, а не «все сообщения
 * всех чатов»: именно этим переписка отличается от прочих доменов, и именно
 * здесь легче всего случайно отдать одному продавцу чужую переписку.
 */

function fakePort(state: Partial<EditorState>): StorePort {
  return {
    get: () => state as EditorState,
    set: () => {},
  };
}

function msg(over: Partial<ChatMessage> = {}): ChatMessage {
  return { id: `msg-${Math.random()}`, from: "seller", text: "Привет", at: 1700000000000, ...over };
}

describe("createChatRepository", () => {
  it("отдаёт ленту только запрошенного собеседника", async () => {
    // Arrange
    const mine = msg({ text: "моё" });
    const other = msg({ text: "чужое" });
    const repo = createChatRepository(fakePort({ chats: { p1: [mine], p2: [other] } }));

    // Act
    const res = await repo.thread("p1");

    // Assert
    expect(res).toEqual({ ok: true, data: [mine] });
  });

  it("на переписке, которой ещё нет, отдаёт пустую ленту, а не отказ", async () => {
    // Arrange: с новым партнёром просто не о чем говорить — это не сбой.
    const repo = createChatRepository(fakePort({ chats: {} }));

    // Act
    const res = await repo.thread("p1");

    // Assert
    expect(res).toEqual({ ok: true, data: [] });
  });

  it("выбрасывает сообщения неверной формы, но остальные показывает", async () => {
    // Arrange: одна битая реплика не повод спрятать всю переписку.
    const good = msg();
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const repo = createChatRepository(
      fakePort({ chats: { p1: [good, { text: "без id" } as never] } }),
    );

    // Act
    const res = await repo.thread("p1");

    // Assert
    expect(res).toEqual({ ok: true, data: [good] });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("передаёт отправку в стор вместе с собеседником", async () => {
    // Arrange
    const sendChatMessage = vi.fn();
    const repo = createChatRepository(fakePort({ sendChatMessage }));

    // Act
    const res = await repo.send("p1", "Приняли 11 коробов");

    // Assert
    expect(sendChatMessage).toHaveBeenCalledWith("p1", "Приняли 11 коробов");
    expect(res.ok).toBe(true);
  });

  it("превращает падение отправки в отказ — черновик экрану ещё пригодится", async () => {
    // Arrange
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const repo = createChatRepository(
      fakePort({
        sendChatMessage: () => {
          throw new Error("сеть недоступна");
        },
      }),
    );

    // Act
    const res = await repo.send("p1", "Привет");

    // Assert
    expect(res).toEqual({ ok: false, error: "data.failed" });
    spy.mockRestore();
  });

  it("передаёт отметку о прочтении в стор", async () => {
    // Arrange
    const markChatRead = vi.fn();
    const repo = createChatRepository(fakePort({ markChatRead }));

    // Act
    const res = await repo.markRead("p1");

    // Assert
    expect(markChatRead).toHaveBeenCalledWith("p1");
    expect(res.ok).toBe(true);
  });
});
