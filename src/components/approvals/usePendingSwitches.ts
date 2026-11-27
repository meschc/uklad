import { useCallback, useEffect, useState } from "react";
import { switchRepository, type SwitchRequest } from "@/lib/data";

/** Как часто кабинет забирает новые заявки на смену процесса. */
const POLL_MS = 5000;

export interface PendingSwitches {
  /** `null` — ещё не загрузили. */
  items: SwitchRequest[] | null;
  /** Забрать заново сразу, не дожидаясь опроса (после решения). */
  refresh: () => void;
}

/**
 * Заявки на смену процесса, ждущие старшего. Один опрос на экран «Заданий»:
 * его читают и счётчик чипа «Подтверждения», и сам список (раньше чип считал
 * только спорный товар и показывал 0 при живой заявке — разбор 27.11).
 */
export function usePendingSwitches(enabled: boolean): PendingSwitches {
  const [items, setItems] = useState<SwitchRequest[] | null>(enabled ? null : []);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let gone = false;
    void switchRepository.pending().then((res) => {
      if (!gone && res.ok) setItems(res.data);
    });
    const timer = setTimeout(() => setTick((n) => n + 1), POLL_MS);
    return () => {
      gone = true;
      clearTimeout(timer);
    };
  }, [tick, enabled]);
  const refresh = useCallback(() => setTick((n) => n + 1), []);
  return { items: enabled ? items : [], refresh };
}

/** Кто решает смену процесса: тот же набор прав, что у сервера (`goods.decide`) и руководителя. */
export const mayDecideSwitch = (perms: readonly string[] | null | undefined) =>
  !perms || perms.includes("staff.manage") || perms.includes("goods.decide");
