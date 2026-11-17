import { useEffect, useMemo, useState } from "react";
import { MessagesSquare, Users } from "lucide-react";
import { selectRole, useEditor, visibleChatPartners } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/fulfillment/ScreenShell";
import { ChatThreadList } from "./ChatThreadList";
import { ChatThread } from "./ChatThread";

/**
 * Чат склада с продавцами в личном кабинете (п.3).
 *
 * Две колонки, а не список с переходом на отдельный экран: склад отвечает
 * нескольким продавцам подряд, и возврат «назад к списку» после каждого ответа
 * — это лишнее движение на каждое сообщение. У продавца собеседник один, и
 * колонка со списком ему не нужна вовсе — она просто не рисуется.
 *
 * Экран занимает высоту целиком и прокручивается только внутри ленты: чат, в
 * котором вместе с сообщениями уезжает поле ввода, перестаёт быть чатом.
 */
export function ChatScreen() {
  const t = useT();
  const role = useEditor(selectRole);
  const partners = useEditor(visibleChatPartners);
  const chats = useEditor((s) => s.chats);
  const activeChatId = useEditor((s) => s.activeChatId);
  const openChat = useEditor((s) => s.openChat);
  const [query, setQuery] = useState("");
  // Телефон: список ИЛИ переписка, как list-detail в Material и любой
  // мессенджер — в две колонки на 390 px сообщения сжимались до слова в
  // строке (Кирилл 17.11). Входим всегда в список, даже если переписка
  // открыта с прошлого раза; «назад» в шапке переписки возвращает к нему.
  // На компьютере обе колонки, как раньше.
  const [threadShown, setThreadShown] = useState(false);

  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return partners;
    return partners.filter((p) => p.name.toLowerCase().includes(q));
  }, [partners, query]);

  // Продавцу выбирать не из чего: открываем его единственную переписку сами,
  // иначе он смотрел бы на «выберите собеседника» с одним вариантом.
  const solo = role === "seller" ? (partners[0]?.id ?? null) : null;
  useEffect(() => {
    if (solo && activeChatId !== solo) openChat(solo);
  }, [solo, activeChatId, openChat]);

  const active = partners.find((p) => p.id === activeChatId) ?? null;
  const listed = role !== "seller";
  const onPhoneThread = !listed || (threadShown && !!active);

  if (!partners.length) {
    return (
      <div className="flex h-full items-center justify-center bg-background p-6">
        <EmptyState
          icon={<Users className="size-5" />}
          title={t("chat.noPartners")}
          body={t("chat.noPartnersHint")}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 bg-background">
      {listed && (
        <ChatThreadList
          partners={found}
          chats={chats}
          role={role}
          activeId={activeChatId}
          query={query}
          onQuery={setQuery}
          onPick={(id) => {
            openChat(id);
            setThreadShown(true);
          }}
          className={onPhoneThread ? "max-md:hidden" : "max-md:w-full max-md:border-r-0"}
        />
      )}

      {active ? (
        <ChatThread
          key={active.id}
          partner={active}
          messages={chats[active.id] ?? []}
          role={role}
          onBack={listed ? () => setThreadShown(false) : undefined}
          className={onPhoneThread ? undefined : "max-md:hidden"}
        />
      ) : (
        <div
          className={cn(
            "flex min-w-0 flex-1 items-center justify-center p-6",
            !onPhoneThread && "max-md:hidden",
          )}
        >
          <EmptyState icon={<MessagesSquare className="size-5" />} title={t("chat.empty")} />
        </div>
      )}
    </div>
  );
}
