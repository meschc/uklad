import { Clock, Coffee, Hourglass, LogIn, LogOut, Play, Wallet } from "lucide-react";
import { useEditor } from "@/lib/store";
import { workstationRepository } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import {
  allowedMarks,
  autoIdleSince,
  earnings,
  idleMs,
  shiftState,
  startOfDay,
  startOfMonth,
  workedMs,
} from "@/lib/workstation";
import type { IdleReason, ShiftMark, StaffMember } from "@/lib/types";
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

const ICONS: Record<ShiftMark, typeof Clock> = {
  shift_start: LogIn,
  break_start: Coffee,
  break_end: Clock,
  idle_start: Hourglass,
  idle_end: Play,
  shift_end: LogOut,
};

const IDLE_REASONS: IdleReason[] = ["no_work", "other"];

export function ShiftMenu({ member, now }: { member: StaffMember; now: number }) {
  const t = useT();
  const events = useEditor((s) => s.staffEvents);
  const mark = useCommand(workstationRepository.mark);
  const policy = useEditor((s) => s.breakPolicy);
  const autoIdle = autoIdleSince(events, member.id, policy, now);

  const state = shiftState(events, member.id);
  const lastMark = events
    .filter((e) => e.staffId === member.id && !e.type.startsWith("pack_"))
    .at(-1);
  const today = workedMs(events, member.id, startOfDay(now), now);
  const month = workedMs(events, member.id, startOfMonth(now), now);
  const idleToday = idleMs(events, member.id, startOfDay(now), now);
  const earnedToday = earnings(today, member.hourlyRate);
  const earnedMonth = earnings(month, member.hourlyRate);
  const packedToday = events.filter(
    (e) =>
      e.staffId === member.id &&
      e.type === "pack_label" &&
      !!e.productId &&
      e.at >= startOfDay(now),
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
              : state === "break" || state === "idle"
                ? "bg-amber-500"
                : "bg-muted-foreground/40",
          )}
        />
      </div>

      {autoIdle != null && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
          {t("ws.idle.auto", { t: formatTime(autoIdle, t.lang) })}
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {allowedMarks(state)
          .filter((type) => type !== "idle_start")
          .map((type, i) => {
            const Icon = ICONS[type as ShiftMark];
            return (
              <Button
                key={type}
                size="lg"
                // Главная кнопка одна — первая допустимая: «вернуться», «перерыв»…
                variant={i === 0 ? "default" : "outline"}
                disabled={mark.pending}
                className="h-14 text-base"
                onClick={() => void mark.run(type as ShiftMark)}
              >
                <Icon />
                {t(`ws.mark.${type}` as MsgKey)}
              </Button>
            );
          })}
      </div>
      {allowedMarks(state).includes("idle_start") && (
        // Простой — с причиной: «нет работы» оплачивается, и складу важно
        // видеть его отдельно от «отошёл по своим делам».
        <div className="flex flex-col gap-2">
          <p className={eyebrow({ tone: "muted" })}>{t("ws.idle.title")}</p>
          <div className="grid grid-cols-2 gap-2">
            {IDLE_REASONS.map((r) => (
              <Button
                key={r}
                variant="outline"
                disabled={mark.pending}
                className="h-12"
                onClick={() => void mark.run("idle_start", r)}
              >
                <Hourglass />
                {t(`ws.idle.${r}` as MsgKey)}
              </Button>
            ))}
          </div>
        </div>
      )}
      {mark.error && <p className="text-sm text-destructive">{t(mark.error)}</p>}

      <dl className="grid grid-cols-2 gap-2">
        <Stat label={t("ws.hours.today")} value={hours(t, today)} />
        <Stat label={t("ws.hours.month")} value={hours(t, month)} />
        <Stat label={t("ws.idle.today")} value={hours(t, idleToday)} />
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
