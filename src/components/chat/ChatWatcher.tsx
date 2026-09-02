import { useEffect, useRef } from "react";
import type { ChatMessage } from "@/lib/types";
import { countUnread, useEditor, visibleChatPartners } from "@/lib/store";
import { useChatDemoReply } from "./useChatDemoReply";

/**
 * Уведомление о новом сообщении (п.3).
 *
 * Живёт в `App`, а не на экране чата: смысл уведомления ровно в том, чтобы
 * узнать о сообщении, находясь в другом месте — на приёмке, в задании, в плане.
 * Ничего не рисует сам: показывает тост, который в приложении и так есть.
 *
 * Срабатывает на рост числа непрочитанных, а не на «пришло сообщение». Разница
 * важна: пока человек стоит в открытой переписке, входящее сразу помечается
 * прочитанным, счётчик не растёт — и тост не мешает читать то, о чём собирался
 * сообщить.
 */
export function ChatWatcher() {
  const showToast = useEditor((s) => s.showToast);
  const seedChatsOnce = useEditor((s) => s.seedChatsOnce);
  const partnerCount = useEditor((s) => s.warehouse.partners?.length ?? 0);
  const unread = useEditor((s) =>
    countUnread(s.chats, s.session.user.role, visibleChatPartners(s)),
  );
  const prevUnread = useRef(unread);

  useChatDemoReply();

  // Демо-переписка раздаётся при входе в кабинет, а не при открытии чата: иначе
  // счётчик в рельсе появлялся бы только после того, как человек уже зашёл в
  // чат, — то есть никогда бы его туда и не позвал.
  useEffect(() => {
    seedChatsOnce();
  }, [seedChatsOnce, partnerCount]);

  useEffect(() => {
    if (unread > prevUnread.current) {
      const s = useEditor.getState();
      const partners = visibleChatPartners(s);
      const newest = newestThread(
        s.chats,
        partners.map((p) => p.id),
      );
      const name = partners.find((p) => p.id === newest)?.name;
      if (name) showToast("chat.toast", { name });
    }
    prevUnread.current = unread;
  }, [unread, showToast]);

  return null;
}

/** Переписка с самым свежим сообщением из видимых — про неё и уведомляем. */
function newestThread(
  chats: Record<string, ChatMessage[]>,
  ids: string[],
): string | null {
  let best: string | null = null;
  let bestAt = -1;
  for (const id of ids) {
    const messages = chats[id];
    const last = messages?.[messages.length - 1];
    if (last && last.at > bestAt) {
      bestAt = last.at;
      best = id;
    }
  }
  return best;
}
