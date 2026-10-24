import { Coffee, Hourglass, Timer, UtensilsCrossed } from "lucide-react";
import { useEditor } from "@/lib/store";
import { workstationRepository } from "@/lib/data";
import { nextBreak, shiftStartedAt, shiftState } from "@/lib/workstation";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { formatTime, useNow } from "./useNow";

/**
 * Смена и перерыв — в шапке рабочего места, двумя строками. Главное на экране
 * товар, поэтому смена ужата до таймера: нажатие открывает панель смены, а
 * нажатие на перерыв сразу его начинает (или заканчивает). Тикает раз в
 * секунду отдельно от остального экрана.
 */
export function ShiftBar({ staffId, onOpen }: { staffId: string; onOpen: () => void }) {
  const t = useT();
  const now = useNow(1000);
  const events = useEditor((s) => s.staffEvents);
  const policy = useEditor((s) => s.breakPolicy);
  const start = shiftStartedAt(events, staffId);
  const row = "flex items-center gap-1.5 rounded px-1 text-left hover:bg-muted";

  if (start == null)
    return (
      <button type="button" className={cn(row, "text-sm text-muted-foreground")} onClick={onOpen}>
        <Timer className="size-4" />
        {t("ws.shift.off")}
      </button>
    );

  const state = shiftState(events, staffId);
  const onBreak = state === "break";
  if (state === "idle")
    return (
      <div className="flex flex-col items-start text-sm leading-tight">
        <button type="button" className={row} onClick={onOpen}>
          <Timer className="size-4 text-muted-foreground" />
          {t("ws.bar.shift")}
          <span className="font-semibold tabular-nums">{clock(now - start)}</span>
        </button>
        <button
          type="button"
          className={cn(row, "text-xs text-amber-600")}
          onClick={() => void workstationRepository.mark("idle_end")}
        >
          <Hourglass className="size-3.5" />
          {t("ws.shift.idle")} · {t("ws.mark.idle_end")}
        </button>
      </div>
    );
  const next = onBreak ? null : nextBreak(events, staffId, policy, now);
  const ready = !!next && now >= next.at;
  const Icon = next?.kind === "lunch" ? UtensilsCrossed : Coffee;

  return (
    <div className="flex flex-col items-start text-sm leading-tight">
      <button type="button" className={row} onClick={onOpen}>
        <Timer className="size-4 text-muted-foreground" />
        {t("ws.bar.shift")}
        <span className="font-semibold tabular-nums">{clock(now - start)}</span>
      </button>
      <button
        type="button"
        className={cn(
          row,
          "text-xs",
          onBreak
            ? "text-amber-600"
            : ready
              ? "font-medium text-emerald-600"
              : "text-muted-foreground",
        )}
        title={t(onBreak ? "ws.mark.break_end" : "ws.mark.break_start")}
        onClick={() => void workstationRepository.mark(onBreak ? "break_end" : "break_start")}
      >
        {onBreak ? <Coffee className="size-3.5" /> : <Icon className="size-3.5" />}
        {onBreak
          ? t("ws.mark.break_end")
          : next &&
            (ready
              ? t(next.kind === "lunch" ? "ws.bar.lunchNow" : "ws.bar.breakNow", {
                  m: next.minutes,
                })
              : t(next.kind === "lunch" ? "ws.bar.lunchAt" : "ws.bar.breakAt", {
                  t: formatTime(next.at, t.lang),
                  m: next.minutes,
                }))}
      </button>
    </div>
  );
}

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}
