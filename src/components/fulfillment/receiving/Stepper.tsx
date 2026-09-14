import { Box as BoxIcon, CheckCircle2, Layers, MapPin, Package } from "lucide-react";
import { type MsgKey, type TFunc } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Step } from "./types";

/** Шаги мастера в том порядке, в каком они идут на рампе. */
const STEPS: { id: Step; key: MsgKey; icon: typeof Package }[] = [
  { id: "pallet", key: "recv.step.pallet", icon: Layers },
  { id: "box", key: "recv.step.box", icon: BoxIcon },
  { id: "product", key: "recv.step.product", icon: Package },
  { id: "qty", key: "recv.step.qty", icon: CheckCircle2 },
  { id: "place", key: "recv.step.place", icon: MapPin },
];

/** Полоса прогресса мастера: где человек сейчас и сколько ещё осталось. */
export function Stepper({
  step,
  hasShipment,
  crossDock,
  t,
}: {
  step: Step;
  hasShipment: boolean;
  crossDock?: boolean;
  t: TFunc;
}) {
  // У кроссдока шага «место» нет: товар на полку не встаёт (п.10.1).
  const steps = crossDock ? STEPS.filter((s) => s.id !== "place") : STEPS;
  const idx = steps.findIndex((s) => s.id === step);
  return (
    <ol className="flex items-center gap-1 text-[11px]">
      {steps.map((s, i) => {
        // Без сверки шаг «количество» остаётся, но подписан иначе.
        const active = i === idx;
        const passed = i < idx;
        return (
          <li key={s.id} className="flex items-center gap-1">
            <span
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : passed
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground",
              )}
            >
              <s.icon className="size-3" />
              {t(s.id === "qty" && !hasShipment ? "recv.step.qtyFree" : s.key)}
            </span>
            {i < steps.length - 1 && <span className="text-muted-foreground/40">·</span>}
          </li>
        );
      })}
    </ol>
  );
}
