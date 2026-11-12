import { Coffee, Hourglass, Timer, type LucideIcon } from "lucide-react";
import { useEditor } from "@/lib/store";
import { workstationRepository } from "@/lib/data";
import { shiftState } from "@/lib/workstation";
import { useT, type MsgKey } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

/**
 * Задание — только на смене. Не на смене, на перерыве или в простое экран
 * задания не показываем вовсе, а вместо него — одно действие крупно: начать
 * смену, вернуться с перерыва, закончить простой. Так нельзя ни начать сборку
 * без смены, ни случайно продолжить её на перерыве: часы и пики считаются
 * только по смене. Начатое задание лежит в сторе и вернётся после отметки.
 */
const GATE: Record<
  "off" | "break" | "idle",
  { icon: LucideIcon; text: MsgKey; mark: "shift_start" | "break_end" | "idle_end" }
> = {
  off: { icon: Timer, text: "ws.gate.off", mark: "shift_start" },
  break: { icon: Coffee, text: "ws.breakFirst", mark: "break_end" },
  idle: { icon: Hourglass, text: "ws.idle.blocked", mark: "idle_end" },
};

export function ShiftGate({ staffId, children }: { staffId: string; children: React.ReactNode }) {
  const t = useT();
  const state = useEditor((s) => shiftState(s.staffEvents, staffId));
  if (state === "on") return <>{children}</>;
  const gate = GATE[state];
  const Icon = gate.icon;
  const mark = async () => {
    const res = await workstationRepository.mark(gate.mark);
    useEditor.getState().showToast(res?.ok ? `ws.ev.${gate.mark}` : "ws.markRejected");
  };
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-warning/15 text-warning">
        <Icon className="size-6" />
      </span>
      <p className="max-w-sm text-base font-medium">{t(gate.text)}</p>
      <Button size="lg" className="h-14 w-full max-w-xs text-base" onClick={() => void mark()}>
        {t(`ws.mark.${gate.mark}`)}
      </Button>
    </div>
  );
}
