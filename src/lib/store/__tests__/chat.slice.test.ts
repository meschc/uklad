import { describe, expect, it } from "vitest";
import { countUnread, visibleChatPartners } from "../chat.slice";
import type { EditorState } from "../state";
import type { ChatMessage, Partner, Session, UserRole } from "../../types";
import { makeChatStore } from "./harness";

/**
 * Переписка склада с продавцами.
 *
 * Проверяем не «сообщение добавилось» — это видно и глазами, — а три места, где
 * чат врёт молча: кому какие переписки видны, что считается непрочитанным и
 * когда отметка о прочтении ставится задним числом всей ленте разом.
 */

const PARTNERS: Partner[] = [
  { id: "p1", name: "ООО «Технопарк»" },
  { id: "p2", name: "ИП Сергеев" },
];

function session(role: UserRole): Session {
  return {
    user: { id: "u1", email: "u@example.com", role, warehouseId: "w1" },
    token: "t",
    startedAt: 0,
  };
}

function msg(from: UserRole, over: Partial<ChatMessage> = {}): ChatMessage {
  return { id: `m${Math.random()}`, from, text: "текст", at: Date.now(), ...over };
}

/** Состояние-заглушка: чату нужны только роль и партнёры склада. */
function base(role: UserRole, chats: Record<string, ChatMessage[]> = {}) {
  return {
    session: session(role),
    warehouse: { partners: PARTNERS },
    chats,
  } as unknown as Partial<EditorState>;
}

describe("visibleChatPartners", () => {
  it("складу показывает всех партнёров", () => {
    // Arrange
    const store = makeChatStore(base("warehouse"));

    // Act
    const visible = visibleChatPartners(store.getState());

    // Assert
    expect(visible.map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  it("продавцу показывает только его собственную переписку", () => {
    // Arrange: продавец в прототипе — первый партнёр склада.
    const store = makeChatStore(base("seller"));

    // Act
    const visible = visibleChatPartners(store.getState());

    // Assert
    expect(visible.map((p) => p.id)).toEqual(["p1"]);
  });
});

describe("countUnread", () => {
  it("не считает переписку с удалённым партнёром", () => {
    // Arrange: лента осталась, а партнёра в складе уже нет — открыть её неоткуда.
    const chats = { ghost: [msg("seller")], p1: [msg("seller")] };

    // Act
    const n = countUnread(chats, "warehouse", PARTNERS);

    // Assert
    expect(n).toBe(1);
  });

  it("считает входящие обеих переписок и пропускает свои", () => {
    // Arrange
    const chats = {
      p1: [msg("seller"), msg("warehouse")],
      p2: [msg("seller"), msg("seller", { readAt: Date.now() })],
    };

    // Act & Assert
    expect(countUnread(chats, "warehouse", PARTNERS)).toBe(2);
  });
});

describe("sendChatMessage", () => {
  it("пишет от лица текущей роли", () => {
    // Arrange
    const store = makeChatStore(base("warehouse"));

    // Act
    store.getState().sendChatMessage("p1", "Приняли 11 коробов");

    // Assert
    expect(store.getState().chats.p1).toHaveLength(1);
    expect(store.getState().chats.p1[0].from).toBe("warehouse");
    expect(store.getState().chats.p1[0].readAt).toBeUndefined();
  });

  it("игнорирует пустое сообщение и обрезает пробелы", () => {
    // Arrange
    const store = makeChatStore(base("seller"));

    // Act
    store.getState().sendChatMessage("p1", "   ");
    store.getState().sendChatMessage("p1", "  спасибо  ");

    // Assert
    expect(store.getState().chats.p1).toHaveLength(1);
    expect(store.getState().chats.p1[0].text).toBe("спасибо");
  });
});

describe("markChatRead", () => {
  it("гасит только входящие и не трогает свои", () => {
    // Arrange
    const mine = msg("warehouse");
    const theirs = msg("seller");
    const store = makeChatStore(base("warehouse", { p1: [mine, theirs] }));

    // Act
    store.getState().markChatRead("p1");

    // Assert
    const [own, incoming] = store.getState().chats.p1;
    expect(own.readAt).toBeUndefined();
    expect(incoming.readAt).toBeGreaterThan(0);
  });

  it("не переписывает ленту, когда читать нечего", () => {
    // Arrange: без этой проверки каждое открытие чата плодило бы новый массив
    // и заставляло перерисовываться всех, кто на него подписан.
    const store = makeChatStore(base("warehouse", { p1: [msg("warehouse")] }));
    const before = store.getState().chats;

    // Act
    store.getState().markChatRead("p1");

    // Assert
    expect(store.getState().chats).toBe(before);
  });
});

describe("openChat", () => {
  it("запоминает открытую переписку, не трогая сами сообщения", () => {
    // Arrange: прочитанность метит лента через `chatRepository.markRead` —
    // здесь только состояние интерфейса, и непрочитанное обязано остаться.
    const store = makeChatStore(base("warehouse", { p1: [msg("seller")] }));
    const before = store.getState().chats;

    // Act
    store.getState().openChat("p1");

    // Assert
    expect(store.getState().activeChatId).toBe("p1");
    expect(store.getState().chats).toBe(before);
  });
});

describe("seedChatsOnce", () => {
  it("раздаёт демо-переписку по живым партнёрам склада", () => {
    // Arrange
    const store = makeChatStore(base("warehouse"));

    // Act
    store.getState().seedChatsOnce();

    // Assert: ленты привязаны к id этого склада, а не к выдуманным при сборке.
    expect(Object.keys(store.getState().chats).sort()).toEqual(["p1", "p2"]);
    expect(countUnread(store.getState().chats, "warehouse", PARTNERS)).toBeGreaterThan(0);
  });

  it("не перетирает уже существующую переписку", () => {
    // Arrange
    const store = makeChatStore(base("warehouse", { p1: [msg("seller", { text: "своё" })] }));

    // Act
    store.getState().seedChatsOnce();

    // Assert
    expect(store.getState().chats.p1).toHaveLength(1);
    expect(store.getState().chats.p1[0].text).toBe("своё");
  });
});

describe("receiveDemoReply", () => {
  it("отвечает всегда от лица второй стороны", () => {
    // Arrange
    const store = makeChatStore(base("warehouse", { p1: [msg("warehouse")] }));

    // Act
    store.getState().receiveDemoReply("p1");

    // Assert
    const messages = store.getState().chats.p1;
    expect(messages).toHaveLength(2);
    expect(messages[1].from).toBe("seller");
  });

  it("молчит в переписке, которой ещё нет", () => {
    // Arrange
    const store = makeChatStore(base("warehouse"));

    // Act
    store.getState().receiveDemoReply("p1");

    // Assert
    expect(store.getState().chats.p1).toBeUndefined();
  });
});
