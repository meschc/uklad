import { useState } from "react";
import { Power } from "lucide-react";
import { useEditor } from "@/lib/store";
import { isSessionLive } from "@/lib/workstation";
import type { Device } from "@/lib/types";
import { useT, type MsgKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { card } from "@/components/ui/card";
import { eyebrow } from "@/components/ui/eyebrow";
import { SortTh, useDataTable } from "@/components/ui/data-table";
import { ScreenShell } from "@/components/fulfillment/ScreenShell";
import { useNow } from "./useNow";
import { BindDeviceForm } from "./BindDeviceForm";
import { RevokeDevice } from "./RevokeDevice";

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
  const [revoking, setRevoking] = useState<Device | null>(null);

  const devTable = useDataTable(devices, [
    { id: "name", value: (d) => d.name },
    { id: "station", value: (d) => t(`ws.station.${d.station}` as MsgKey) },
    { id: "who", value: (d) => who(d.id) },
    { id: "since", value: (d) => d.createdAt },
  ]);

  function who(id: string) {
    if (id !== thisId || !isSessionLive(session, now)) return null;
    return staff.find((m) => m.id === session!.staffId)?.name ?? null;
  }

  return (
    <ScreenShell title={t("devices.title")} subtitle={t("devices.lead")} wide>
      <section className={cn(card(), "flex flex-col gap-3 p-4")}>
        <h2 className={eyebrow()}>{t("devices.bindTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("devices.bindHint")}</p>
        <BindDeviceForm onBound={() => useEditor.getState().goToView("workstation")} />
      </section>

      {devices.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("devices.empty")}</p>
      ) : (
        <div className={cn(card(), "overflow-x-auto")}>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <SortTh table={devTable.table} id="name" className="px-4">
                  {t("devices.col.name")}
                </SortTh>
                <SortTh table={devTable.table} id="station" className="px-4">
                  {t("devices.col.station")}
                </SortTh>
                <SortTh table={devTable.table} id="who" className="px-4">
                  {t("devices.col.who")}
                </SortTh>
                <SortTh table={devTable.table} id="since" className="px-4">
                  {t("devices.col.since")}
                </SortTh>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {devTable.rows.map((d) => (
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
                      <Button variant="ghost" size="sm" onClick={() => setRevoking(d)}>
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
      {revoking && (
        <RevokeDevice device={revoking} who={who(revoking.id)} onClose={() => setRevoking(null)} />
      )}
    </ScreenShell>
  );
}
