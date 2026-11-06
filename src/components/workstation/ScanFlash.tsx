import { useEffect } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

import type { Flash } from "./scanFeedback";

const SHOW_MS = 700;

/**
 * Крупная вспышка подтверждения скана поверх экрана: зелёная — принято,
 * красная — ошибка. Монитор стоит далеко, мелкая подпись под полем не видна.
 */
export function ScanFlash({ flash, onDone }: { flash: Flash; onDone: () => void }) {
  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(onDone, SHOW_MS);
    return () => window.clearTimeout(id);
  }, [flash, onDone]);

  if (!flash) return null;
  const ok = flash.kind === "ok";
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none fixed inset-0 z-50 flex animate-fade-in items-center justify-center",
        ok ? "bg-emerald-500/25" : "bg-destructive/25",
      )}
    >
      <span
        className={cn(
          "flex size-40 items-center justify-center rounded-full text-white shadow-2xl",
          ok ? "bg-emerald-500" : "bg-destructive",
        )}
      >
        {ok ? (
          <Check className="size-24" strokeWidth={3} />
        ) : (
          <X className="size-24" strokeWidth={3} />
        )}
      </span>
    </div>
  );
}
