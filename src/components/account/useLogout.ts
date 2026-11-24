import { useState } from "react";
import { authRepository } from "@/lib/data/authRepository";
import { leaveServerSession } from "@/lib/store/leave";
import { flushServerSync, hasDeferredCopy } from "@/lib/store/serverSync";
import { useEditor } from "@/lib/store";

/**
 * Выход из кабинета — один для «Настроек» и пункта «Выйти» в меню.
 *
 * Выход с сервера стирает копию кабинета на этом компьютере. Всё записано и
 * отложенной копии нет — выходим сразу; иначе `confirming`: экран показывает
 * строку «не всё записано» с «Скачать копию», и второй вызов `logout`
 * выходит. Не дошёл до сервера — экран входа говорит, что сессия там жива.
 * Двойное нажатие безопасно: выход с сервера повторяем.
 */
export function useLogout() {
  const goToLogin = useEditor((s) => s.goToLogin);
  const serverSession = useEditor((s) => s.session.source === "server");
  const [confirming, setConfirming] = useState(false);
  const [deferred, setDeferred] = useState(false);
  const logout = async () => {
    if (!serverSession) return goToLogin();
    if (!confirming) {
      const synced = await flushServerSync();
      const hasDeferred = hasDeferredCopy();
      if (!synced || hasDeferred) {
        setDeferred(hasDeferred);
        return setConfirming(true);
      }
    }
    const res = await authRepository.logout();
    leaveServerSession(res.ok ? undefined : "offline");
  };
  return { logout, confirming, deferred, cancel: () => setConfirming(false) };
}
