import { Coffee } from "lucide-react";
import { useEditor } from "@/lib/store";
import type { BreakPolicy } from "@/lib/types";
import { useT, type MsgKey } from "@/lib/i18n";
import { card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/**
 * Расписание перерывов склада. Его задаёт руководитель, а рабочее место
 * показывает сотруднику, когда следующий перерыв доступен.
 */
export function BreakPolicyCard() {
  const t = useT();
  const policy = useEditor((s) => s.breakPolicy);
  const set = useEditor((s) => s.setBreakPolicy);

  const lunch = `${String(Math.floor(policy.lunchFrom / 60)).padStart(2, "0")}:${String(policy.lunchFrom % 60).padStart(2, "0")}`;
  const num = (key: keyof BreakPolicy, label: MsgKey) => (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {t(label)}
      <Input
        type="number"
        inputMode="numeric"
        defaultValue={policy[key]}
        onBlur={(e) => set({ [key]: Number(e.target.value) })}
      />
    </label>
  );

  return (
    <section className={card({ className: "flex flex-col gap-3" })}>
      <h2 className="flex items-center gap-1.5 text-sm font-semibold">
        <Coffee className="size-3.5 text-muted-foreground" />
        {t("ws.policy.title")}
      </h2>
      <p className="text-xs text-muted-foreground">{t("ws.policy.body")}</p>
      <div className="grid gap-3 sm:grid-cols-5">
        {num("everyMin", "ws.policy.every")}
        {num("shortMin", "ws.policy.short")}
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t("ws.policy.lunchFrom")}
          <Input
            type="time"
            defaultValue={lunch}
            onBlur={(e) => {
              const [h, m] = e.target.value.split(":").map(Number);
              if (Number.isFinite(h) && Number.isFinite(m)) set({ lunchFrom: h * 60 + m });
            }}
          />
        </label>
        {num("lunchMin", "ws.policy.lunchMin")}
        {num("autoIdleMin", "ws.policy.autoIdle")}
      </div>
    </section>
  );
}
