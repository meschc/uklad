import { useState } from "react";
import { MonitorSmartphone } from "lucide-react";
import { workstationRepository, type BindConfirm } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import type { WorkstationKind } from "@/lib/types";
import { useT, type MsgKey } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";
import { FormError } from "@/components/ui/field";
import { useEditor } from "@/lib/store";
import { OPEN_STATIONS } from "@/lib/stationSwitch";
import { BindConfirmStep } from "./BindConfirmStep";

/**
 * Привязать этот компьютер как стол склада. Одна форма на двух экранах:
 * «Устройства» в кабинете и само рабочее место — привязывают, сидя за тем
 * компьютером, поэтому первый раз это удобнее сделать прямо на столе.
 *
 * Привязывает руководитель здесь и сейчас (миграция 052): вошёл паролем
 * только что — сразу; вход давний — сервер просит его бейдж или пароль, и
 * форма показывает этот шаг. Забытый открытым вход стол не заводит.
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
  const add = useCommand(workstationRepository.addDevice, { exclusive: true });
  // Привязать стол сервер даёт только с правом менять персонал: без него
  // форма лишь упёрлась бы в «не получилось». Прав нет (демо) — решает сервер.
  const canBind = useEditor(
    (s) =>
      s.session.source !== "server" ||
      !s.session.permissions ||
      s.session.permissions.includes("staff.manage"),
  );

  // Сервер попросил подтвердить: дальше форма ждёт бейдж или пароль.
  const [confirming, setConfirming] = useState(false);
  const bind = async (confirm?: BindConfirm) => {
    const res = await add.run(name, station, confirm);
    if (res.ok) onBound?.();
    else if (res.error === "devices.confirmNeeded") setConfirming(true);
  };

  if (!canBind) {
    return <p className="text-sm text-muted-foreground">{t("devices.bindNeedsManager")}</p>;
  }

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
          <Select
            value={station}
            onChange={(e) => setStation(e.target.value as WorkstationKind)}
            className={cn(
              "rounded-md border border-input bg-background px-2 text-sm",
              stacked ? "h-10" : "h-9",
            )}
          >
            {OPEN_STATIONS.map((st) => (
              <option key={st} value={st}>
                {t(`ws.station.${st}` as MsgKey)}
              </option>
            ))}
          </Select>
        </label>
        <Button type="submit" size={stacked ? "lg" : "default"} disabled={add.pending}>
          <MonitorSmartphone />
          {t("devices.bind")}
        </Button>
      </form>
      {confirming ? (
        <BindConfirmStep
          pending={add.pending}
          error={add.error && add.error !== "devices.confirmNeeded" ? add.error : null}
          onConfirm={(confirm) => void bind(confirm)}
        />
      ) : (
        add.error && <FormError>{t(add.error)}</FormError>
      )}
    </>
  );
}
