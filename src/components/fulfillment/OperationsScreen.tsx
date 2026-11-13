import { useState } from "react";
import { useT } from "@/lib/i18n";
import { Segmented } from "@/components/ui/segmented";
import { ScreenShell } from "./ScreenShell";
import { ReportPanel, ServicesPanel } from "./ServicesPanels";

/**
 * «Услуги и цены» — что склад продаёт, почём и сколько набежало продавцу.
 *
 * Задания на работы склада отсюда ушли в экран «Задания» (Кирилл 12 ноя):
 * здесь настройка и расчёт, а не работа смены.
 */

type Tab = "services" | "report";

export function OperationsScreen() {
  const t = useT();
  const [tab, setTab] = useState<Tab>("services");
  return (
    <ScreenShell wide title={t("ops.title")} subtitle={t("ops.subtitle")}>
      <div>
        <Segmented
          size="md"
          value={tab}
          onChange={setTab}
          ariaLabel={t("ops.title")}
          options={[
            { value: "services", label: t("ops.tab.services") },
            { value: "report", label: t("ops.tab.report") },
          ]}
        />
      </div>
      {tab === "services" && <ServicesPanel />}
      {tab === "report" && <ReportPanel />}
    </ScreenShell>
  );
}
