import type { ReactNode } from "react";
import { Check, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export type BannerTone = "idle" | "ok" | "warn" | "error";

/**
 * Результат скана одной широкой полосой: зелёное — принято, жёлтое — «не
 * всё, нужен следующий шаг», красное — стоп, серое — ждём следующий скан. Читается краем глаза; текст дублирует цвет для
 * тех, кто всё же смотрит. Одна и та же полоса на всех столах.
 */
export function ScanBanner({ tone, children }: { tone: BannerTone; children: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex min-h-14 items-center gap-3 rounded-xl px-4 py-3 text-xl font-semibold transition-colors duration-200",
        tone === "error"
          ? "bg-destructive text-destructive-foreground"
          : tone === "ok"
            ? "bg-success text-white"
            : tone === "warn"
              ? "bg-warning text-black"
              : "bg-muted text-muted-foreground",
      )}
    >
      {tone === "error" || tone === "warn" ? (
        <TriangleAlert className="size-6 shrink-0" />
      ) : tone === "ok" ? (
        <Check className="size-6 shrink-0" />
      ) : null}
      <span className="min-w-0 leading-snug">{children}</span>
    </div>
  );
}
