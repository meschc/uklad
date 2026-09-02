import type { ChatMessage, UserRole } from "./types";

/**
 * Разбор ленты сообщений для экрана чата.
 *
 * Вынесено из компонента, потому что здесь легко ошибиться незаметно: и
 * группировка по дням, и «непрочитано» выглядят правильными на глаз при любой
 * реализации, а врут — на границе суток и на своих же сообщениях.
 */

/** Сообщения одного дня. */
export interface ChatDay {
  /** Начало суток, мс — и ключ списка, и то, что показывает заголовок. */
  at: number;
  messages: ChatMessage[];
}

/** Начало суток по локальному времени. */
function startOfDay(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Сгруппировать ленту по дням, сохранив порядок сообщений.
 *
 * Именно по локальным суткам, а не по «прошло 24 часа»: разделитель в чате
 * отвечает на вопрос «какого числа это было», и сообщение в 23:50 с ответом в
 * 00:10 обязано разъехаться на два дня — иначе завтрашняя договорённость
 * читается как вчерашняя.
 */
export function groupMessagesByDay(messages: ChatMessage[]): ChatDay[] {
  const days: ChatDay[] = [];
  for (const m of messages) {
    const at = startOfDay(m.at);
    const last = days[days.length - 1];
    if (last && last.at === at) last.messages.push(m);
    else days.push({ at, messages: [m] });
  }
  return days;
}

/**
 * Сколько сообщений в ленте ждут ответа этой роли.
 *
 * Свои сообщения не считаются никогда, даже пока их не прочитал собеседник:
 * непрочитанное — это то, что должен прочитать я, а не то, что не прочитали
 * меня. Иначе счётчик загорался бы от собственной отправки.
 */
export function unreadIn(messages: ChatMessage[], role: UserRole): number {
  return messages.filter((m) => m.from !== role && !m.readAt).length;
}

/** Последнее сообщение ленты — строка предпросмотра в списке переписок. */
export function lastMessage(messages: ChatMessage[]): ChatMessage | null {
  return messages.length ? messages[messages.length - 1] : null;
}
