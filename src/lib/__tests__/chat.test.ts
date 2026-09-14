import { describe, expect, it } from "vitest";
import { groupMessagesByDay, lastMessage, unreadIn } from "../chat";
import type { ChatMessage } from "../types";

/**
 * Разбор ленты переписки.
 *
 * Обе функции ошибаются незаметно: разделитель дней выглядит правдоподобно при
 * любой группировке, а счётчик непрочитанных — при любом определении «своё».
 * Врут они ровно в двух местах: на границе суток и на собственных сообщениях,
 * их и проверяем.
 */

function msg(over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: `m${Math.random()}`,
    from: "seller",
    text: "текст",
    at: Date.now(),
    ...over,
  };
}

/** Момент внутри конкретных суток по локальному времени. */
function at(day: number, hour: number, minute = 0): number {
  return new Date(2026, 2, day, hour, minute).getTime();
}

describe("groupMessagesByDay", () => {
  it("разводит по разным дням сообщения через полночь", () => {
    // Arrange: 23:50 и 00:10 — двадцать минут разницы, но разные сутки.
    const evening = msg({ id: "a", at: at(10, 23, 50) });
    const night = msg({ id: "b", at: at(11, 0, 10) });

    // Act
    const days = groupMessagesByDay([evening, night]);

    // Assert
    expect(days).toHaveLength(2);
    expect(days[0].messages.map((m) => m.id)).toEqual(["a"]);
    expect(days[1].messages.map((m) => m.id)).toEqual(["b"]);
  });

  it("держит сообщения одних суток в одной группе и в исходном порядке", () => {
    // Arrange
    const morning = msg({ id: "a", at: at(10, 9) });
    const noon = msg({ id: "b", at: at(10, 13) });
    const evening = msg({ id: "c", at: at(10, 21) });

    // Act
    const days = groupMessagesByDay([morning, noon, evening]);

    // Assert
    expect(days).toHaveLength(1);
    expect(days[0].messages.map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(days[0].at).toBe(at(10, 0));
  });

  it("возвращает пустой список на пустой ленте", () => {
    expect(groupMessagesByDay([])).toEqual([]);
  });
});

describe("unreadIn", () => {
  it("не считает непрочитанными собственные сообщения", () => {
    // Arrange: склад написал два раза, продавец их ещё не открыл.
    const messages = [msg({ from: "warehouse" }), msg({ from: "warehouse" })];

    // Act & Assert: для склада это не «новое», а «своё».
    expect(unreadIn(messages, "warehouse")).toBe(0);
    expect(unreadIn(messages, "seller")).toBe(2);
  });

  it("считает только входящие без отметки о прочтении", () => {
    // Arrange
    const messages = [
      msg({ from: "seller", readAt: Date.now() }),
      msg({ from: "seller" }),
      msg({ from: "warehouse" }),
    ];

    // Act & Assert
    expect(unreadIn(messages, "warehouse")).toBe(1);
  });
});

describe("lastMessage", () => {
  it("возвращает последнее сообщение ленты", () => {
    const messages = [msg({ id: "a" }), msg({ id: "b" })];
    expect(lastMessage(messages)?.id).toBe("b");
  });

  it("возвращает null на пустой ленте", () => {
    expect(lastMessage([])).toBeNull();
  });
});
