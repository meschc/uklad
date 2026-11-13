import { useState } from "react";
import { MonitorSmartphone } from "lucide-react";
import { workstationRepository } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import type { WorkstationKind } from "@/lib/types";
import { useT, type MsgKey } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Места, у которых уже есть свой экран. Остальные видны в списке как «скоро». */
const READY: WorkstationKind[] = ["pack", "receiving", "picking", "shipping", "inventory"];
const STATIONS: WorkstationKind[] = [
  "pack",
  "receiving",
  "picking",
  "shipping",
  "inventory",
  "marking",
  "returns",
];

/**
 * Привязать этот компьютер как стол склада. Одна форма на двух экранах:
 * «Устройства» в кабинете и само рабочее место — привязывают, сидя за тем
 * компьютером, поэтому первый раз это удобнее сделать прямо на столе.
 */
export function BindDeviceForm({
  onBound,
  stacked,
}: {
  onBound?: () => void;
  /** Столбиком по центру — на рабочем месте; в строку — в «Устройствах». */
  stacked?: boolean;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [station, setStation] = useState<WorkstationKind>("pack");
  const add = useCommand(workstationRepository.addDevice);

  const bind = async () => {
    const res = await add.run(name, station);
    if (res.ok) onBound?.();
  };

  return (
    <>
      <form
        className={
          stacked
            ? "flex flex-col gap-3"
            : "grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem_auto] sm:items-end"
        }
        onSubmit={(e) => {
          e.preventDefault();
          void bind();
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">{t("devices.name")}</span>
          <Input
            className={stacked ? "h-10" : "h-9"}
            value={name}
            maxLength={60}
            placeholder={t("devices.namePlaceholder")}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">{t("devices.station")}</span>
          <select
            value={station}
            onChange={(e) => setStation(e.target.value as WorkstationKind)}
            className={cn(
              "rounded-md border border-input bg-background px-2 text-sm",
              stacked ? "h-10" : "h-9",
            )}
          >
            {STATIONS.map((st) => (
              <option key={st} value={st} disabled={!READY.includes(st)}>
                {t(`ws.station.${st}` as MsgKey)}
                {!READY.includes(st) && ` · ${t("ws.soon")}`}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size={stacked ? "lg" : "default"} disabled={add.pending}>
          <MonitorSmartphone />
          {t("devices.bind")}
        </Button>
      </form>
      {add.error && <p className="text-sm text-destructive">{t(add.error)}</p>}
    </>
  );
}
