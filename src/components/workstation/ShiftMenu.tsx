import { Clock, Coffee, LogIn, LogOut, Wallet } from "lucide-react";
import { useEditor } from "@/lib/store";
import { workstationRepository } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import {
  allowedMarks,
  earnings,
  shiftState,
  startOfDay,
  startOfMonth,
  workedMs,
} from "@/lib/workstation";
import type { StaffMember, StaffEventType } from "@/lib/types";
import { useT, type MsgKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { card } from "@/components/ui/card";
import { eyebrow } from "@/components/ui/eyebrow";
import { formatTime } from "./useNow";

/**
 * Меню сотрудника: смена, перерыв, часы и заработок. Вёрстка одна на стол,
 * ТСД и телефон — узкая колонка с крупными кнопками, которые нажимают
 * пальцем в перчатке. Кнопки показывают только допустимые переходы, поэтому
 * «перерыв без смены» в журнал не попадёт.
 */

type Mark = Extract<StaffEventType, "shift_start" | "break_start" | "break_end" | "shift_end">;

const ICONS: Record<Mark, typeof Clock> = {
  shift_start: LogIn,
  break_start: Coffee,
  break_end: Clock,
  shift_end: LogOut,
};

export function ShiftMenu({ member, now }: { member: StaffMember; now: number }) {
  const t = useT();
  const events = useEditor((s) => s.staffEvents);
  const mark = useCommand(workstationRepository.mark);

  const state = shiftState(events, member.id);
  const lastMark = events
    .filter((e) => e.staffId === member.id && !e.type.startsWith("pack_"))
    .at(-1);
  const today = workedMs(events, member.id, startOfDay(now), now);
  const month = workedMs(events, member.id, startOfMonth(now), now);
  const earnedToday = earnings(today, member.hourlyRate);
  const earnedMonth = earnings(month, member.hourlyRate);
  const packedToday = events.filter(
    (e) => e.staffId === member.id && e.type === "pack_done" && e.at >= startOfDay(now),
  ).length;

  return (
    <div className="flex flex-col gap-4">
      <div className={card({ className: "flex items-center justify-between gap-3" })}>
        <div>
          <p className={eyebrow({ tone: "muted" })}>{member.role}</p>
          <p className="text-lg font-semibold">{t(`ws.shift.${state}` as MsgKey)}</p>
          {state !== "off" && lastMark && (
            <p className="text-xs text-muted-foreground">
              {t("ws.shift.since", { t: formatTime(lastMark.at, t.lang) })}
            </p>
          )}
        </div>
        <span
          className={cn(
            "size-3 rounded-full",
            state === "on"
              ? "bg-emerald-500"
              : state === "break"
                ? "bg-amber-500"
                : "bg-muted-foreground/40",
          )}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {allowedMarks(state).map((type) => {
          const Icon = ICONS[type as Mark];
          return (
            <Button
              key={type}
              size="lg"
              variant={type === "shift_end" ? "outline" : "default"}
              disabled={mark.pending}
              className="h-14 text-base"
              onClick={() => void mark.run(type as Mark)}
            >
              <Icon />
              {t(`ws.mark.${type}` as MsgKey)}
            </Button>
          );
        })}
      </div>
      {mark.error && <p className="text-sm text-destructive">{t(mark.error)}</p>}

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label={t("ws.hours.today")} value={hours(t, today)} />
        <Stat label={t("ws.hours.month")} value={hours(t, month)} />
        <Stat label={t("ws.packedToday")} value={String(packedToday)} />
      </dl>

      <div className={card({ className: "flex items-start gap-3" })}>
        <Wallet className="mt-0.5 size-5 text-primary" />
        {earnedToday == null ? (
          <p className="text-sm text-muted-foreground">{t("ws.noRate")}</p>
        ) : (
          <div className="grid flex-1 grid-cols-[minmax(0,1fr)_7rem] gap-x-3 gap-y-1 text-sm">
            <span className="text-muted-foreground">
              {t("ws.earned")} · {t("ws.hours.today").toLowerCase()}
            </span>
            <span className="whitespace-nowrap text-right font-medium tabular-nums">
              {rub(earnedToday)}
            </span>
            <span className="text-muted-foreground">
              {t("ws.earned")} · {t("ws.hours.month").toLowerCase()}
            </span>
            <span className="whitespace-nowrap text-right font-medium tabular-nums">
              {rub(earnedMonth!)}
            </span>
            <span className="col-span-2 text-xs text-muted-foreground">
              {t("ws.rate", { r: member.hourlyRate! })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={card({ pad: "md" })}>
      <dt className={eyebrow({ tone: "muted", size: "xs" })}>{label}</dt>
      <dd className="mt-1 text-base font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function hours(t: ReturnType<typeof useT>, ms: number): string {
  const min = Math.floor(ms / 60_000);
  return t("ws.hours.value", { h: Math.floor(min / 60), m: min % 60 });
}

function rub(n: number): string {
  return `${n.toLocaleString("ru-RU")}\u00a0₽`;
}
