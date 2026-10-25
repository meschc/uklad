import { Coffee, Hourglass, Timer, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { useEditor } from "@/lib/store";
import { workstationRepository } from "@/lib/data";
import { MARK_UNDO_MS, nextBreak, shiftStartedAt, shiftState, stateSince } from "@/lib/workstation";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useNow } from "./useNow";

/**
 * Смена и перерыв — в шапке рабочего места, двумя столбиками: сверху слово,
 * под ним таймер. Смена считает, сколько идёт смена; перерыв — сколько до него
 * осталось, а на перерыве или в простое — сколько он уже длится. Нажатие на смену открывает
 * панель смены, на перерыв — сразу начинает (или заканчивает) его. Повторное
 * нажатие в первые секунды отменяет перерыв: общий экран задевают локтем.
 * Что сделает нажатие, подсказывает надпись под блоком при наведении.
 * Перерыв, доступный дольше `OVERDUE_MS`, обведён рамкой — человек без
 * перерыва устаёт и ошибается.
 */
const OVERDUE_MS = 15 * 60_000;

export function ShiftBar({ staffId, onOpen }: { staffId: string; onOpen: () => void }) {
  const t = useT();
  const now = useNow(1000);
  const events = useEditor((s) => s.staffEvents);
  const policy = useEditor((s) => s.breakPolicy);
  const start = shiftStartedAt(events, staffId);

  if (start == null)
    return (
      <Cell
        icon={Timer}
        label={t("ws.bar.shift")}
        value={t("ws.shift.off")}
        muted
        hint={t("ws.bar.openShift")}
        onClick={onOpen}
      />
    );

  const state = shiftState(events, staffId);
  const onBreak = state === "break";
  const next = onBreak ? null : nextBreak(events, staffId, policy, now);
  const ready = !!next && now >= next.at;
  const since = stateSince(events, staffId) ?? now;
  const overdue = ready && now - next.at > OVERDUE_MS;
  const undoable = onBreak && now - since < MARK_UNDO_MS;

  if (state === "idle")
    return (
      <div className="flex items-start gap-1">
        <Cell
          icon={Timer}
          label={t("ws.bar.shift")}
          value={clock(now - start)}
          hint={t("ws.bar.openShift")}
          onClick={onOpen}
        />
        <Cell
          icon={Hourglass}
          label={t("ws.shift.idle")}
          value={clock(now - since)}
          tone="amber"
          hint={t("ws.mark.idle_end")}
          onClick={() => void workstationRepository.mark("idle_end")}
        />
      </div>
    );

  return (
    <div className="flex items-start gap-1">
      <Cell
        icon={Timer}
        label={t("ws.bar.shift")}
        value={clock(now - start)}
        hint={t("ws.bar.openShift")}
        onClick={onOpen}
      />
      <Cell
        icon={next?.kind === "lunch" ? UtensilsCrossed : Coffee}
        label={t(next?.kind === "lunch" ? "ws.bar.lunch" : "ws.bar.break")}
        value={
          onBreak
            ? clock(now - since)
            : !next
              ? "—"
              : overdue
                ? t("ws.bar.overdue", { t: clock(now - next.at) })
                : ready
                  ? t("ws.bar.now")
                  : clock(next.at - now)
        }
        tone={onBreak ? "amber" : ready ? "green" : undefined}
        ring={overdue}
        hint={t(
          undoable ? "ws.bar.undoBreak" : onBreak ? "ws.mark.break_end" : "ws.mark.break_start",
        )}
        onClick={() =>
          // Повторное нажатие в первые секунды — отмена случайного перерыва,
          // а не возврат с него: в журнале не остаётся трёхсекундного перерыва.
          void (undoable
            ? workstationRepository.undoMark()
            : workstationRepository.mark(onBreak ? "break_end" : "break_start"))
        }
      />
    </div>
  );
}

function Cell({
  icon: Icon,
  label,
  value,
  tone,
  muted,
  ring,
  hint,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: "amber" | "green";
  muted?: boolean;
  ring?: boolean;
  /** Что сделает нажатие — всплывает под блоком при наведении. */
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`${label} ${value}. ${hint}`}
      onClick={onClick}
      className={cn(
        "group relative flex flex-col items-center rounded-md p-1.5 text-center leading-tight hover:bg-muted",
        ring && "ring-2 ring-emerald-500",
      )}
    >
      <span className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </span>
      <span
        className={cn(
          "text-sm font-semibold tabular-nums",
          muted && "font-normal text-muted-foreground",
          tone === "amber" && "text-amber-600",
          tone === "green" && "text-emerald-600",
        )}
      >
        {value}
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-1 text-xs text-background opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {hint}
      </span>
    </button>
  );
}

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}
