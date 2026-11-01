import { useState } from "react";
import { MonitorSmartphone, Power } from "lucide-react";
import { useEditor } from "@/lib/store";
import { workstationRepository } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import { isSessionLive } from "@/lib/workstation";
import type { WorkstationKind } from "@/lib/types";
import { useT, type MsgKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { card } from "@/components/ui/card";
import { eyebrow } from "@/components/ui/eyebrow";
import { ScreenShell } from "@/components/fulfillment/ScreenShell";
import { useNow } from "./useNow";

/** Места, у которых уже есть свой экран. Остальные видны в списке как «скоро». */
const READY: WorkstationKind[] = ["pack", "receiving", "picking", "shipping"];
const STATIONS: WorkstationKind[] = [
  "pack",
  "receiving",
  "picking",
  "shipping",
  "marking",
  "returns",
];

/**
 * Устройства склада (вид `devices`, группа «О складе»). Руководитель заводит
 * компьютер у стола, сидя за ним: браузер сразу становится рабочим местом и
 * дальше открывается только входом по бейджу. Здесь же потерянный ТСД гасят
 * одной кнопкой.
 *
 * Кто сейчас за каким столом и когда был последний скан — с сервера, по
 * договору `support/devices-contract-2026-10-25.md`. В демо известен только
 * этот браузер.
 */
export function DevicesScreen() {
  const t = useT();
  const now = useNow();
  const devices = useEditor((s) => s.devices);
  const thisId = useEditor((s) => s.thisDeviceId);
  const session = useEditor((s) => s.stationSession);
  const staff = useEditor((s) => s.warehouse.staff) ?? [];
  const [name, setName] = useState("");
  const [station, setStation] = useState<WorkstationKind>("pack");
  const add = useCommand(workstationRepository.addDevice);
  const revoke = useCommand(workstationRepository.revokeDevice);

  const bind = async () => {
    const res = await add.run(name, station);
    if (res.ok) useEditor.getState().goToView("workstation");
  };

  const who = (id: string) => {
    if (id !== thisId || !isSessionLive(session, now)) return null;
    return staff.find((m) => m.id === session!.staffId)?.name ?? null;
  };

  return (
    <ScreenShell title={t("devices.title")} subtitle={t("devices.lead")} wide>
      <section className={cn(card(), "flex flex-col gap-3 p-4")}>
        <h2 className={eyebrow()}>{t("devices.bindTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("devices.bindHint")}</p>
        <form
          className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void bind();
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{t("devices.name")}</span>
            <Input
              className="h-9"
              value={name}
              placeholder={t("devices.namePlaceholder")}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{t("devices.station")}</span>
            <select
              value={station}
              onChange={(e) => setStation(e.target.value as WorkstationKind)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              {STATIONS.map((st) => (
                <option key={st} value={st} disabled={!READY.includes(st)}>
                  {t(`ws.station.${st}` as MsgKey)}
                  {!READY.includes(st) && ` · ${t("ws.soon")}`}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={add.pending}>
            <MonitorSmartphone />
            {t("devices.bind")}
          </Button>
        </form>
        {add.error && <p className="text-sm text-destructive">{t(add.error)}</p>}
      </section>

      {devices.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("devices.empty")}</p>
      ) : (
        <div className={cn(card(), "overflow-x-auto")}>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2 font-medium">{t("devices.col.name")}</th>
                <th className="px-4 py-2 font-medium">{t("devices.col.station")}</th>
                <th className="px-4 py-2 font-medium">{t("devices.col.who")}</th>
                <th className="px-4 py-2 font-medium">{t("devices.col.since")}</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr
                  key={d.id}
                  className={cn(
                    "border-b border-border last:border-0",
                    d.revokedAt && "opacity-50",
                  )}
                >
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{d.name}</span>
                    {d.id === thisId && !d.revokedAt && (
                      <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                        {t("devices.this")}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">{t(`ws.station.${d.station}` as MsgKey)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {d.revokedAt
                      ? t("devices.revoked", {
                          d: new Date(d.revokedAt).toLocaleDateString(t.lang),
                        })
                      : (who(d.id) ?? t("devices.nobody"))}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                    {new Date(d.createdAt).toLocaleDateString(t.lang)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {!d.revokedAt && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={revoke.pending}
                        onClick={() => void revoke.run(d.id)}
                      >
                        <Power />
                        {t("devices.revoke")}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ScreenShell>
  );
}
