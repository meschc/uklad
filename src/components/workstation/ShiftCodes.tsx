import { useEffect } from "react";
import type { ShiftMark } from "@/lib/types";
import { useEditor } from "@/lib/store";
import { workstationRepository } from "@/lib/data";
import { useT, type MsgKey } from "@/lib/i18n";
import { allowedMarks, parseShiftMarkCode, shiftMarkCode, shiftState } from "@/lib/workstation";
import { QrSvg } from "@/components/table/QrSvg";
import { SHIFT_SCAN_EVENT } from "@/components/fulfillment/ScanField";

/**
 * Коды отметок смены внизу экрана: сканер у стола читает их прямо с монитора,
 * и смена или перерыв отмечаются без мыши. Показываем только допустимые
 * сейчас отметки; результат — уведомлением справа.
 */
export function ShiftCodes({ staffId }: { staffId: string }) {
  const t = useT();
  const events = useEditor((s) => s.staffEvents);
  // Конец смены кодом не ставится (Кирилл 27.11): код рядом с «перерывом»
  // легко отсканировать по ошибке. Закончить смену — кнопкой с подтверждением.
  const marks = allowedMarks(shiftState(events, staffId)).filter(
    (m) => m !== "idle_start" && m !== "shift_end",
  );

  useEffect(() => {
    const onScan = (e: Event) => {
      const mark = parseShiftMarkCode(String((e as CustomEvent).detail));
      // Распечатанный когда-то код конца смены не срабатывает.
      if (mark === "shift_end") {
        useEditor.getState().notify("error", "ws.mark.endByButton");
        return;
      }
      void (async () => {
        const res = mark ? await workstationRepository.mark(mark as ShiftMark) : null;
        useEditor
          .getState()
          .notify(
            res?.ok ? "success" : "error",
            res?.ok ? (`ws.ev.${mark}` as MsgKey) : "ws.markRejected",
          );
      })();
    };
    window.addEventListener(SHIFT_SCAN_EVENT, onScan);
    return () => window.removeEventListener(SHIFT_SCAN_EVENT, onScan);
  }, []);

  return (
    // На телефоне коды не нужны: смена и перерыв — в нижней панели.
    <ul className="mt-6 hidden flex-wrap justify-center gap-6 border-t border-border pt-6 md:flex">
      {marks.map((m) => (
        <li key={m} className="flex flex-col items-center gap-1.5 text-xs text-muted-foreground">
          <QrSvg code={shiftMarkCode(m)} size={72} showCode={false} />
          {t(`ws.mark.${m}` as MsgKey)}
        </li>
      ))}
    </ul>
  );
}
