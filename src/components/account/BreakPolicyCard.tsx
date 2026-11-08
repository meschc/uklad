import { useEditor } from "@/lib/store";
import type { BreakPolicy } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { Input } from "@/components/ui/input";

const DAY = 24 * 60;
const hhmm = (min: number) => {
  const m = ((min % DAY) + DAY) % DAY;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const parse = (v: string) => {
  const [h, m] = v.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

/**
 * Расписание перерывов склада фразами, а не сеткой из пяти полей: «Перерыв 15
 * мин каждые 120 мин работы», «Обед с 13:00 до 13:40». Обед задаётся началом и
 * концом; длина считается по кругу суток, поэтому ночная смена с обедом
 * 02:00–02:40 или 23:40–00:20 задаётся так же, как дневная.
 */
export function BreakPolicyCard() {
  const t = useT();
  const policy = useEditor((s) => s.breakPolicy);
  const set = useEditor((s) => s.setBreakPolicy);

  const num = (key: keyof BreakPolicy) => (
    <Input
      key={`${key}-${policy[key]}`}
      type="number"
      inputMode="numeric"
      min={0}
      defaultValue={policy[key]}
      onBlur={(e) => set({ [key]: Math.max(0, Number(e.target.value) || 0) })}
      className="h-8 w-16 text-center"
    />
  );
  const time = (value: number, onSet: (min: number) => void) => (
    <Input
      key={value}
      type="time"
      defaultValue={hhmm(value)}
      onBlur={(e) => {
        const v = parse(e.target.value);
        if (v !== null) onSet(v);
      }}
      className="h-8 w-24"
    />
  );
  const row = "flex flex-wrap items-center gap-2 text-sm";

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold">{t("ws.policy.title")}</h2>
      <p className={row}>
        <span className="w-20 text-muted-foreground">{t("ws.policy.shortRow")}</span>
        {num("shortMin")}
        {t("ws.policy.minEvery")}
        {num("everyMin")}
        {t("ws.policy.minWork")}
      </p>
      <p className={row}>
        <span className="w-20 text-muted-foreground">{t("ws.policy.lunch")}</span>
        {t("ws.policy.from")}
        {time(policy.lunchFrom, (from) => set({ lunchFrom: from }))}
        {t("ws.policy.to")}
        {time(policy.lunchFrom + policy.lunchMin, (to) =>
          set({ lunchMin: (to - policy.lunchFrom + DAY) % DAY }),
        )}
      </p>
      <p className={row}>
        <span className="w-20 text-muted-foreground">{t("ws.policy.idleRow")}</span>
        {num("autoIdleMin")}
        <span className="text-muted-foreground">{t("ws.policy.idleTail")}</span>
      </p>
    </section>
  );
}
