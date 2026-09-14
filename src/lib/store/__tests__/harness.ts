import { create, type StateCreator } from "zustand";
import { createRequestsSlice } from "../requests.slice";
import { createChatSlice } from "../chat.slice";
import type { ChatSlice, EditorState, RequestsSlice } from "../state";

/**
 * Стенд для среза заявок.
 *
 * Настоящий стор (`store/index.ts`) при импорте лезет в localStorage, сеет
 * демо-историю и подписывается на undo — в тесте всё это только мешает: данные
 * пришлось бы сначала стирать, а результат зависел бы от посева. Поэтому
 * собираем ровно один срез поверх состояния, которое задаёт сам тест.
 *
 * Бронь и кроссдокинг не выходят за пределы `requests` и `expectedShipments`,
 * так что соседние срезы здесь не нужны.
 */

/** Тот же создатель среза, но без persist-мутатора: хранилища в тесте нет. */
const requestsSlice = createRequestsSlice as unknown as StateCreator<
  EditorState,
  [],
  [],
  RequestsSlice
>;

export function makeRequestsStore(initial: Partial<EditorState> = {}) {
  return create<EditorState>()((...a) => ({ ...requestsSlice(...a), ...initial }) as EditorState);
}

const chatSlice = createChatSlice as unknown as StateCreator<EditorState, [], [], ChatSlice>;

/**
 * Стенд для чата. Срез читает роль из `session` и партнёров из `warehouse`,
 * поэтому тест обязан задать оба — иначе проверялась бы не логика переписки, а
 * значения по умолчанию соседних срезов.
 */
export function makeChatStore(initial: Partial<EditorState> = {}) {
  return create<EditorState>()((...a) => ({ ...chatSlice(...a), ...initial }) as EditorState);
}
