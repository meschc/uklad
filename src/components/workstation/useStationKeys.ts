import { useEffect, useRef } from "react";
import { useEditor } from "@/lib/store";
import { workstationRepository } from "@/lib/data";
import { allowedMarks, shiftState, stationKey, type StationKey } from "@/lib/workstation";

/** Второе нажатие F4 в это окно завершает смену. */
const CONFIRM_MS = 3000;

/**
 * Кнопки ТСД на рабочем месте (`stationKey`). Завершение смены — двойным
 * нажатием: одна случайная кнопка в кармане не должна закрывать человеку смену.
 */
export function useStationKeys(
  staffId: string | undefined,
  toggle: (panel: "shift" | "log") => void,
) {
  const endArmed = useRef(0);
  const toggleRef = useRef(toggle);
  useEffect(() => {
    toggleRef.current = toggle;
  });

  useEffect(() => {
    if (!staffId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const inField = !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
      const action = stationKey(e.key, inField);
      if (!action) return;
      e.preventDefault();
      run(action, staffId);
    };
    const run = (action: StationKey, id: string) => {
      const s = useEditor.getState();
      const state = shiftState(s.staffEvents, id);
      const marks = allowedMarks(state);
      if (action === "shift" || action === "log") return toggleRef.current(action);
      if (action === "break") {
        if (state === "break") return void mark("break_end");
        if (marks.includes("break_start")) return void mark("break_start");
        return toggleRef.current("shift");
      }
      if (!marks.includes("shift_end")) return s.showToast("ws.keys.noShift");
      if (Date.now() - endArmed.current > CONFIRM_MS) {
        endArmed.current = Date.now();
        return s.showToast("ws.keys.endAgain");
      }
      endArmed.current = 0;
      void mark("shift_end");
    };
    const mark = async (type: "break_start" | "break_end" | "shift_end") => {
      const res = await workstationRepository.mark(type);
      useEditor.getState().showToast(res?.ok ? `ws.ev.${type}` : "ws.markRejected");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [staffId]);
}
