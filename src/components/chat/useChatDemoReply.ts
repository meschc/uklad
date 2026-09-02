import { useEffect, useRef } from "react";
import { useEditor } from "@/lib/store";

/**
 * Ответ собеседника в демо.
 *
 * Это единственное место во всём чате, которое имитирует вторую сторону, и
 * существует оно только потому, что бэкенда нет: без него отправленное
 * сообщение остаётся без ответа навсегда, и ни входящего, ни уведомления о нём
 * в прототипе увидеть невозможно. Когда появится сервер, файл удаляется
 * целиком — остальной чат об этом ничего не знает.
 *
 * Отвечаем только на сообщения, отправленные в этом сеансе: иначе последняя
 * реплика из демо-сценария вызывала бы «ответ» при каждой перезагрузке.
 */
const REPLY_DELAY_MS = 7000;

export function useChatDemoReply() {
  const chats = useEditor((s) => s.chats);
  const role = useEditor((s) => s.session.user.role);
  const receiveDemoReply = useEditor((s) => s.receiveDemoReply);
  /** Что было последним в каждой переписке на момент загрузки — это не наше. */
  const baseline = useRef<Record<string, string> | null>(null);
  const timers = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!baseline.current) {
      baseline.current = {};
      for (const [id, messages] of Object.entries(chats)) {
        const last = messages[messages.length - 1];
        if (last) baseline.current[id] = last.id;
      }
      return;
    }

    for (const [id, messages] of Object.entries(chats)) {
      const last = messages[messages.length - 1];
      if (!last) continue;
      const mineJustNow = last.from === role && baseline.current[id] !== last.id;
      if (mineJustNow && !timers.current[id]) {
        timers.current[id] = window.setTimeout(() => {
          delete timers.current[id];
          receiveDemoReply(id);
        }, REPLY_DELAY_MS);
      }
    }
  }, [chats, role, receiveDemoReply]);

  // Таймеры не должны пережить размонтирование: ответ, прилетевший в уже
  // закрытое приложение, — это ошибка в консоли и ничего больше.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const id of Object.keys(pending)) window.clearTimeout(pending[id]);
    };
  }, []);
}
