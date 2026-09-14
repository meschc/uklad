import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { eyebrow } from "@/components/ui/eyebrow";
import { card } from "@/components/ui/card";

/**
 * Мини-графики ручным SVG — в том же духе, что `HeatmapView` (там тоже ручной
 * SVG и цветовой расчёт без библиотек). Графиков четыре и все простые:
 * столбики, донат и плитки. Тянуть ради этого `recharts` (+~100 КБ в бандл,
 * который и так весит больше мегабайта) — плохой обмен.
 */

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "neutral" | "good" | "warn" | "bad";
  icon?: ReactNode;
}) {
  const toneClass = {
    neutral: "text-foreground",
    good: "text-emerald-600 dark:text-emerald-400",
    warn: "text-amber-600 dark:text-amber-400",
    bad: "text-destructive",
  }[tone];

  return (
    <div className={card({ pad: "md", className: "flex flex-col gap-1" })}>
      <div className={eyebrow({ weight: "medium", className: "flex items-center gap-1.5" })}>
        {icon}
        {label}
      </div>
      <div className={cn("text-2xl font-bold tabular-nums", toneClass)}>{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** Столбики по дням. Подписи — только по краям и максимуму, иначе каша. */
export function BarChart({
  data,
  height = 96,
  emptyLabel,
}: {
  data: { label: string; value: number }[];
  height?: number;
  emptyLabel: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const hasData = data.some((d) => d.value > 0);

  if (!hasData) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground"
        style={{ height }}
      >
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-end gap-[3px]" style={{ height }}>
        {data.map((d, i) => (
          <div
            key={`${d.label}-${i}`}
            className="group relative flex-1"
            style={{ height: "100%" }}
            title={`${d.label}: ${d.value}`}
          >
            <div
              className={cn(
                "absolute bottom-0 w-full rounded-t-[3px] transition-[height]",
                d.value > 0 ? "bg-primary" : "bg-muted",
              )}
              style={{
                height: `${d.value > 0 ? Math.max(4, (d.value / max) * 100) : 2}%`,
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] tabular-nums text-muted-foreground">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

/** Донат из долей. Считается по окружности через stroke-dasharray. */
export function Donut({
  segments,
  size = 120,
  centerValue,
  centerLabel,
}: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
  centerValue?: string | number;
  centerLabel?: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = 40;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox="0 0 100 100" role="img">
        <circle cx="50" cy="50" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="14" />
        {total > 0 &&
          segments.map((s) => {
            if (s.value <= 0) return null;
            const len = (s.value / total) * circumference;
            const dash = `${len} ${circumference - len}`;
            const el = (
              <circle
                key={s.label}
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth="14"
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                transform="rotate(-90 50 50)"
              >
                <title>{`${s.label}: ${s.value}`}</title>
              </circle>
            );
            offset += len;
            return el;
          })}
        {centerValue != null && (
          <text
            x="50"
            y={centerLabel ? 48 : 54}
            textAnchor="middle"
            className="fill-foreground"
            style={{ fontSize: 18, fontWeight: 700 }}
          >
            {centerValue}
          </text>
        )}
        {centerLabel && (
          <text
            x="50"
            y="62"
            textAnchor="middle"
            className="fill-muted-foreground"
            style={{ fontSize: 8 }}
          >
            {centerLabel}
          </text>
        )}
      </svg>
      <ul className="flex flex-col gap-1 text-xs">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-[2px]"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="ml-auto font-medium tabular-nums">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Горизонтальная полоса заполненности — для разбивки по этажам. */
export function FillBar({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          {value}/{total} · {pct}%
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
