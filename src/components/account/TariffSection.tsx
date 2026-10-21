import { CreditCard, Headset } from "lucide-react";
import { useEditor } from "@/lib/store";
import { TARIFF_FEATURES, TARIFF_IDS } from "@/lib/tariff";
import type { TariffId } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { Segmented } from "@/components/ui/segmented";
import { card } from "@/components/ui/card";
import { Row } from "./ProfileRow";

/**
 * Тариф и персональный менеджер. Менеджера назначает Уклад, а не клиент,
 * поэтому строка только для чтения: до назначения честно пишем, когда он
 * появится.
 */
export function TariffSection() {
  const t = useT();
  const sub = useEditor((s) => s.subscription);
  const setTariff = useEditor((s) => s.setTariff);
  const hasManager = TARIFF_FEATURES[sub.tariff].personalManager;

  return (
    <div className="flex flex-col gap-2">
      <div
        className={card({
          pad: "none",
          className: "flex flex-col divide-y divide-border overflow-hidden",
        })}
      >
        <Row icon={<CreditCard className="size-4" />} label={t("tariff.label")}>
          <Segmented<TariffId>
            value={sub.tariff}
            onChange={setTariff}
            options={TARIFF_IDS.map((id) => ({ value: id, label: t(`tariff.${id}`) }))}
          />
        </Row>
        <Row icon={<Headset className="size-4" />} label={t("manager.label")}>
          {!hasManager ? (
            <span className="text-sm text-muted-foreground">
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
