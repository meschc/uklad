import { useEffect, useState } from "react";
import { useEditor } from "@/lib/store";
import { switchRepository } from "@/lib/data";
import { useT, type MsgKey } from "@/lib/i18n";

/** Как часто стол спрашивает, решил ли старший. */
const POLL_MS = 3000;

/**
 * Ждёт решения по своей заявке, даже если панель закрыта: старший разрешил —
 * стол применяет переход и говорит, кто разрешил; отклонил — говорит и это.
 */
export function useSwitchWatch() {
  const pending = useEditor((s) => s.pendingSwitch);
  const staff = useEditor((s) => s.warehouse.staff);
  const t = useT();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setTick((n) => n + 1), POLL_MS);
    let gone = false;
    void (async () => {
      const st = await switchRepository.status(pending.id);
      if (gone || !st.ok) return;
      const notify = useEditor.getState().notify;
      const name = t(`ws.station.${pending.station}` as MsgKey);
      if (st.data.status === "approved") {
        const res = await switchRepository.apply(pending.id);
        if (gone) return;
        if (!res.ok) {
          // Нет связи — попробуем следующим опросом. Сервер отказал (заявку
          // применить нельзя) — раньше стол молча опрашивал дальше, и решение
          // старшего «уходило в никуда» (разбор 27.11): говорим и не ждём.
          if (res.error === "ws.switch.offline") return;
          switchRepository.forget();
          notify("error", "ws.switch.applyFailed", { vars: { name } });
          return;
        }
        const who = staff?.find((m) => m.id === res.data)?.name;
        notify("success", who ? "ws.switch.doneBy" : "ws.switch.done", {
          vars: { name, who: who ?? "" },
        });
      } else if (st.data.status !== "pending") {
        switchRepository.forget();
        if (st.data.status === "declined")
          notify("error", "ws.switch.declined", { vars: { name } });
      }
    })();
    return () => {
      gone = true;
      clearTimeout(timer);
    };
  }, [pending, tick, staff, t]);
}
