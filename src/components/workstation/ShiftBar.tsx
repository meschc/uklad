import { Coffee, Timer, UtensilsCrossed } from "lucide-react";
import { useEditor } from "@/lib/store";
import { nextBreak, shiftStartedAt, shiftState } from "@/lib/workstation";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { formatTime, useNow } from "./useNow";

/**
 * Таймер смены и ближайший перерыв — вверху рабочего места. Тикает раз в
 * секунду отдельно от остального экрана: перерисовывать каждую секунду
 * поле скана и список тары незачем.
 */
export function ShiftBar({ staffId }: { staffId: string }) {
  const t = useT();
  const now = useNow(1000);
  const events = useEditor((s) => s.staffEvents);
  const policy = useEditor((s) => s.breakPolicy);
  const start = shiftStartedAt(events, staffId);
  if (start == null) return null;

  const onBreak = shiftState(events, staffId) === "break";
  const next = onBreak ? null : nextBreak(events, staffId, policy, now);
  const ready = !!next && now >= next.at;
  const Icon = next?.kind === "lunch" ? UtensilsCrossed : Coffee;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
      <span className="flex items-center gap-1.5">
        <Timer className="size-4 text-muted-foreground" />
        {t("ws.bar.shift")}
        <span className="font-semibold tabular-nums">{clock(now - start)}</span>
      </span>
      {onBreak ? (
        <span className="flex items-center gap-1.5 text-amber-600">
          <Coffee className="size-4" />
          {t("ws.shift.break")}
        </span>
      ) : (
        next && (
          <span
            className={cn(
              "flex items-center gap-1.5",
              ready ? "font-medium text-emerald-600" : "text-muted-foreground",
            )}
          >
            <Icon className="size-4" />
            {ready
              ? t(next.kind === "lunch" ? "ws.bar.lunchNow" : "ws.bar.breakNow", {
                  m: next.minutes,
                })
              : t(next.kind === "lunch" ? "ws.bar.lunchAt" : "ws.bar.breakAt", {
                  t: formatTime(next.at, t.lang),
                  m: next.minutes,
                })}
          </span>
        )
      )}
    </div>
  );
}

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}
