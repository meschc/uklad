import { useCallback, useEffect, useState } from "react";
import { decidersOf, teamRepository, type TeamState } from "@/lib/data/teamRepository";
import { useEditor } from "@/lib/store";
import type { MsgKey } from "@/lib/i18n";

/**
 * Команда с сервера: люди с входом, роли, роли сотрудников у стола. Нужна и
 * вкладке «Доступ», и таблице сотрудников (колонка «Роль»). Заодно кладёт в
 * стор, кто решает спорное и подписывает документы в кабинете.
 */
export function useTeam(): {
  state: TeamState | null;
  failed: MsgKey | null;
  reload: () => void;
} {
  const setDeskDeciders = useEditor((s) => s.setDeskDeciders);
  const [state, setState] = useState<TeamState | null>(null);
  const [failed, setFailed] = useState<MsgKey | null>(null);
  // Перечитать список: счётчик будит эффект, а ответ ложится в состояние из
  // колбэка, а не прямо в теле эффекта.
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  useEffect(() => {
    let alive = true;
    void teamRepository.list().then((res) => {
      if (!alive) return;
      if (res.ok) {
        setState(res.data);
        setDeskDeciders(decidersOf(res.data));
        setFailed(null);
      } else setFailed(res.error === "team.err.forbidden" ? "team.noAccess" : "team.loadFailed");
    });
    return () => {
      alive = false;
    };
  }, [tick, setDeskDeciders]);
  return { state, failed, reload };
}
