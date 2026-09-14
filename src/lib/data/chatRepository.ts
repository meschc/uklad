import type { ChatMessage } from "../types";
import { isChatMessage } from "./guards";
import { readList, storePort, type StorePort } from "./repository";
import { attempt, type Result } from "./result";

/**
 * Переписка склада с продавцами (п.0.4, п.3).
 *
 * Общий контракт `Repository<T>` здесь не подходит, и это не небрежность:
 * переписка — не плоский список записей с id, а ленты по собеседникам.
 * `list()` без партнёра означал бы «все сообщения всех чатов», а такого запроса
 * в продукте нет ни одного — ни на экране, ни завтра на сервере.
 *
 * Чего здесь нет намеренно:
 *
 * — `seedChatsOnce` и `receiveDemoReply` остаются действиями стора. Первое
 *   раздаёт демо-данные, второе изображает ответ собеседника — это не команды
 *   клиента, а подпорки прототипа. С появлением сервера ответ приходит
 *   подпиской, и оба исчезнут целиком, а не переедут сюда.
 * — `openChat` тоже не команда: он запоминает, какая переписка открыта, — это
 *   состояние интерфейса, соседнее с выделением и зумом. Прочитанность метит
 *   лента (`markRead`), потому что видит их именно она.
 */
export interface ChatRepository {
  /** Лента переписки с одним собеседником. */
  thread: (partnerId: string) => Promise<Result<ChatMessage[]>>;
  send: (partnerId: string, text: string) => Promise<Result<void>>;
  /** Пометить входящие прочитанными. */
  markRead: (partnerId: string) => Promise<Result<void>>;
}

export function createChatRepository(port: StorePort = storePort): ChatRepository {
  return {
    thread: (partnerId) =>
      readList(() => port.get().chats[partnerId] ?? [], isChatMessage, `chats/${partnerId}`),
    send: (partnerId, text) => attempt(() => port.get().sendChatMessage(partnerId, text)),
    markRead: (partnerId) => attempt(() => port.get().markChatRead(partnerId)),
  };
}

export const chatRepository = createChatRepository();
