import { countUnread, useEditor, visibleChatPartners } from "@/lib/store";
import type { AppView } from "@/lib/types";

/**
 * Счётчик у пункта меню: на «Заданиях» — сколько заявок ждут склад прямо
 * сейчас, на «Чате» — непрочитанное. Один на рельс и на нижнюю панель
 * телефона, чтобы цифры в двух меню не разъехались.
 */
export function useNavBadge(): (view: AppView) => number {
  const requests = useEditor((s) => s.requests);
  // Чат считаем по тем же перепискам, что человек в чате и увидит: продавцу
  // видна одна, складу — все (см. visibleChatPartners).
  const unreadChats = useEditor((s) =>
    countUnread(s.chats, s.session.user.role, visibleChatPartners(s)),
  );
  const openRequests = requests.filter(
    (r) => r.status === "new" || r.status === "in_progress",
  ).length;
  return (view) => {
    if (view === "tasks") return openRequests;
    if (view === "chat") return unreadChats;
    return 0;
  };
}
