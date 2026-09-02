import { uid } from "../utils";
import type { ChatMessage, Partner, UserRole } from "../types";
import { demoReplyFor, seedChatFor } from "./seedChat";
import type { ChatSlice, EditorState, SliceCreator } from "./state";

/**
 * Переписка склада с продавцами (п.3).
 *
 * Почему переписка привязана к партнёру, а не к заявке. Заявка живёт день:
 * приехала, собралась, уехала — и закрылась. А спрашивают в чате ровно то, что
 * заявку переживает: «во сколько у вас приёмка», «возврат от прошлой недели
 * нашёлся?», «поднимете тариф с мая?». Лента по заявкам рассыпала бы это на
 * десятки мёртвых обрывков, в которых нельзя найти вчерашнюю договорённость.
 *
 * Кто есть кто. Пользователь здесь один и переключает роль, поэтому «я» — это
 * текущая роль, а собеседник — вторая. Для склада собеседников столько, сколько
 * у него партнёров; для продавца собеседник один — склад.
 */

/**
 * Партнёр, от лица которого пишет продавец.
 *
 * Продавец в прототипе не выбирается из списка: роль — это режим просмотра
 * одних и тех же данных, отдельного аккаунта продавца нет. Значит, и переписка
 * у него должна быть одна, а не шесть чужих. Берём первого партнёра склада —
 * тот же выбор, что делает экран продавца, показывая остатки целиком.
 *
 * Может вернуть `null`: у нового склада партнёров ещё нет, и это не ошибка —
 * экран показывает «сначала заведите партнёра», а не пустую ленту.
 */
export const selectSellerPartnerId = (s: EditorState): string | null =>
  s.warehouse.partners?.[0]?.id ?? null;

/** Сколько входящих сообщений ждут ответа текущей роли. */
export function countUnread(
  chats: Record<string, ChatMessage[]>,
  role: UserRole,
  visible: Partner[],
): number {
  const ids = new Set(visible.map((p) => p.id));
  let n = 0;
  for (const [partnerId, messages] of Object.entries(chats)) {
    // Переписка с удалённым партнёром остаётся в сторе (историю не рвём), но
    // считаться непрочитанной не должна: открыть её уже неоткуда.
    if (!ids.has(partnerId)) continue;
    for (const m of messages) if (m.from !== role && !m.readAt) n += 1;
  }
  return n;
}

/** Партнёры, чьи переписки видит текущая роль. */
export function visibleChatPartners(s: EditorState): Partner[] {
  const partners = s.warehouse.partners ?? [];
  if (s.session.user.role !== "seller") return partners;
  const mine = selectSellerPartnerId(s);
  return partners.filter((p) => p.id === mine);
}

export const createChatSlice: SliceCreator<ChatSlice> = (set, get) => ({
  chats: {},
  activeChatId: null,

  seedChatsOnce: () => {
    const s = get();
    if (Object.keys(s.chats).length > 0) return;
    const partners = s.warehouse.partners ?? [];
    if (!partners.length) return;
    set({ chats: seedChatFor(partners) });
  },

  openChat: (partnerId) => {
    set({ activeChatId: partnerId });
    get().markChatRead(partnerId);
  },

  sendChatMessage: (partnerId, text) => {
    const body = text.trim();
    if (!body) return;
    const message: ChatMessage = {
      id: uid("msg"),
      from: get().session.user.role,
      text: body,
      at: Date.now(),
    };
    set((s) => ({
      chats: { ...s.chats, [partnerId]: [...(s.chats[partnerId] ?? []), message] },
    }));
  },

  receiveDemoReply: (partnerId) => {
    const s = get();
    const messages = s.chats[partnerId];
    if (!messages?.length) return;
    // Отвечает всегда вторая сторона — та, которой человек сейчас не является.
    const from: UserRole = s.session.user.role === "seller" ? "warehouse" : "seller";
    const message: ChatMessage = {
      id: uid("msg"),
      from,
      text: demoReplyFor(from, messages.length),
      at: Date.now(),
    };
    set((st) => ({
      chats: { ...st.chats, [partnerId]: [...(st.chats[partnerId] ?? []), message] },
    }));
  },

  markChatRead: (partnerId) => {
    const role = get().session.user.role;
    const messages = get().chats[partnerId];
    if (!messages?.some((m) => m.from !== role && !m.readAt)) return;
    const at = Date.now();
    set((s) => ({
      chats: {
        ...s.chats,
        [partnerId]: (s.chats[partnerId] ?? []).map((m) =>
          m.from !== role && !m.readAt ? { ...m, readAt: at } : m,
        ),
      },
    }));
  },
});
