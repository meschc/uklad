import { Check, Headset, Minus } from "lucide-react";
import { useEditor } from "@/lib/store";
import { TARIFF_FEATURES, TARIFF_IDS } from "@/lib/tariff";
import { useT, type MsgKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { card } from "@/components/ui/card";
import { Row } from "./ProfileRow";

/** Что показываем на плитке тарифа — то, чем тарифы различаются в кабинете. */
const FEATURE_LABELS: { key: keyof (typeof TARIFF_FEATURES)["start"]; label: MsgKey }[] = [
  { key: "fullAnalytics", label: "tariff.f.analytics" },
  { key: "weeklyEmailBackup", label: "tariff.f.email" },
  { key: "personalManager", label: "tariff.f.manager" },
];

/**
 * Тариф плитками и персональный менеджер. Плитки, а не переключатель: рядом с
 * названием видно, чем тарифы отличаются. Менеджера назначает Уклад, поэтому
 * строка только для чтения.
 */
export function TariffSection() {
  const t = useT();
  const sub = useEditor((s) => s.subscription);
  const setTariff = useEditor((s) => s.setTariff);
  const hasManager = TARIFF_FEATURES[sub.tariff].personalManager;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {TARIFF_IDS.map((id) => {
          const active = id === sub.tariff;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => setTariff(id)}
              className={cn(
                card({ pad: "none" }),
                "flex cursor-pointer flex-col gap-2 p-3 text-left transition-colors",
                active ? "ring-2 ring-primary" : "hover:border-foreground/20",
              )}
            >
              <span className="flex items-center justify-between text-sm font-semibold">
                {t(`tariff.${id}`)}
                {active && <Check className="size-4 text-primary" />}
              </span>
              <ul className="flex flex-col gap-1">
                {FEATURE_LABELS.map((f) => {
                  const on = TARIFF_FEATURES[id][f.key];
                  return (
                    <li
                      key={f.key}
                      className={cn(
                        "flex items-center gap-1.5 text-xs",
                        on ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {on ? (
                        <Check className="size-3 shrink-0 text-primary" />
                      ) : (
                        <Minus className="size-3 shrink-0" />
                      )}
                      {t(f.label)}
                    </li>
                  );
                })}
              </ul>
            </button>
          );
        })}
      </div>

      <div className={card({ pad: "none", className: "overflow-hidden" })}>
        <Row icon={<Headset className="size-4" />} label={t("manager.label")}>
          {!hasManager ? (
            <span className="text-right text-sm text-muted-foreground">
              {t("tariff.onlyIn", { plan: t("tariff.operator") })}
            </span>
          ) : sub.manager ? (
            <div className="flex flex-col items-end text-sm">
              <span className="font-medium">{sub.manager.name}</span>
              <span className="text-xs text-muted-foreground">
                {[sub.manager.phone, sub.manager.email].filter(Boolean).join(" · ")}
              </span>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">{t("manager.pending")}</span>
          )}
        </Row>
      </div>
      <p className="px-1 text-xs text-muted-foreground">{t("tariff.hint")}</p>
    </div>
  );
}
