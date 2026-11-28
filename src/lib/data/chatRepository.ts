import type { ChatMessage, ChatTopic } from "../types";
import { isChatMessage } from "./guards";
import { readList, storePort, type StorePort } from "./repository";
import { attempt, ok, type Result } from "./result";
import { sellerOnServer, sellerPost } from "./sellerServer";

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
  send: (
    partnerId: string,
    text: string,
    replyTo?: string,
    topic?: ChatTopic,
  ) => Promise<Result<void>>;
  edit: (partnerId: string, messageId: string, text: string) => Promise<Result<void>>;
  remove: (partnerId: string, messageId: string) => Promise<Result<void>>;
  /** Пометить входящие прочитанными. */
  markRead: (partnerId: string) => Promise<Result<void>>;
}

/**
 * Продавец на сервере ленту кабинета не пишет: шлёт операцию, а сообщение в
 * ленту кладёт сервер (`sellerChat.js`) — автором продавца из сессии и в
 * переписку его партнёра, какой бы `partnerId` ни пришёл отсюда.
 */
const done = async (r: Promise<Result<unknown>>): Promise<Result<void>> => {
  const res = await r;
  return res.ok ? ok(undefined) : res;
};

export function createChatRepository(port: StorePort = storePort): ChatRepository {
  const seller = () => sellerOnServer(port);
  return {
    thread: (partnerId) =>
      readList(() => port.get().chats[partnerId] ?? [], isChatMessage, `chats/${partnerId}`),
    send: (partnerId, text, replyTo, topic) => {
      if (!seller()) {
        return attempt(() => port.get().sendChatMessage(partnerId, text, replyTo, topic));
      }
      const body = text.trim();
      if (!body) return Promise.resolve(ok(undefined));
      return done(
        sellerPost("/seller-chat/send", { key: crypto.randomUUID(), text: body, replyTo, topic }),
      );
    },
    edit: (partnerId, messageId, text) =>
      seller()
        ? done(sellerPost("/seller-chat/edit", { id: messageId, text: text.trim() }))
        : attempt(() => port.get().editChatMessage(partnerId, messageId, text)),
    remove: (partnerId, messageId) =>
      seller()
        ? done(sellerPost("/seller-chat/delete", { id: messageId }))
        : attempt(() => port.get().deleteChatMessage(partnerId, messageId)),
    markRead: (partnerId) => {
      if (!seller()) return attempt(() => port.get().markChatRead(partnerId));
      // Нечего отмечать — на сервер не ходим: лента открыта, опрос идёт часто.
      const waiting = (port.get().chats[partnerId] ?? []).some(
        (m) => m.from !== "seller" && !m.readAt,
      );
      return waiting ? done(sellerPost("/seller-chat/read", {})) : Promise.resolve(ok(undefined));
    },
  };
}

export const chatRepository = createChatRepository();
