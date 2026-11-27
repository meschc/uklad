import { useState } from "react";
import { History, MonitorSmartphone, Power, Trash2 } from "lucide-react";
import { workstationRepository } from "@/lib/data";
import { useEditor } from "@/lib/store";
import { isSessionLive } from "@/lib/workstation";
import type { Device } from "@/lib/types";
import { useT, type MsgKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SortTh, TableFilters, TableSearch, useDataTable } from "@/components/ui/data-table";
import { EmptyState, ScreenShell } from "@/components/fulfillment/ScreenShell";
import { useNow } from "./useNow";
import { RevokeDevice } from "./RevokeDevice";
import { DeviceJournal } from "./DeviceJournal";
import { Table, TableHeader, Th, Tr, Td } from "@/components/ui/table";

/**
 * Устройства склада (вид `devices`, группа «О складе»): список, журнал и
 * отключение. Привязывают устройство на нём самом, с «Рабочего места», —
 * отдельной формы здесь нет (Кирилл 22.11 и 24.11: «зачем привязывать
 * компьютер со страницы устройств»). Потерянный ТСД гасят здесь одной кнопкой.
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
  const [journalOf, setJournalOf] = useState<Device | null>(null);
  const notify = useEditor((s) => s.notify);
  const goToView = useEditor((s) => s.goToView);
  const forget = async (id: string) => {
    const res = await workstationRepository.forgetDevice(id);
    if (!res.ok) notify("error", res.error);
  };

  const devTable = useDataTable(devices, [
    { id: "name", value: (d) => d.name },
    { id: "station", value: (d) => t(`ws.station.${d.station}` as MsgKey), facet: (v) => v },
    { id: "who", value: (d) => who(d.id) },
    { id: "since", value: (d) => d.createdAt },
  ]);

  function who(id: string) {
    if (id !== thisId || !isSessionLive(session, now)) return null;
    return staff.find((m) => m.id === session!.staffId)?.name ?? null;
  }

  return (
    <ScreenShell title={t("devices.title")} subtitle={t("devices.lead")} wide>
      {devices.length === 0 ? (
        <EmptyState
          icon={<MonitorSmartphone className="size-5" />}
          title={t("devices.emptyTitle")}
          body={t("devices.empty")}
          action={
            <Button variant="outline" size="sm" onClick={() => goToView("workstation")}>
              {t("devices.open")}
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <TableFilters
              facets={devTable.facets}
              filters={devTable.filters}
              onChange={devTable.setFilter}
              labels={{ station: t("devices.col.station") }}
              allLabel={(col) => t("common.filterAll", { col })}
            />
            {/* Поиск слева, как на других экранах: фильтр мест прячется, когда
                место одно, и поле, прижатое вправо, оставляло пустоту (разбор 27.11). */}
            <TableSearch
              value={devTable.query}
              onChange={devTable.setQuery}
              placeholder={t("common.search")}
            />
          </div>
          <Table>
            <TableHeader>
              <SortTh table={devTable.table} id="name">
                {t("devices.col.name")}
              </SortTh>
              <SortTh table={devTable.table} id="station">
                {t("devices.col.station")}
              </SortTh>
              <SortTh table={devTable.table} id="who">
                {t("devices.col.who")}
              </SortTh>
              <SortTh table={devTable.table} id="since">
                {t("devices.col.since")}
              </SortTh>
              <Th />
            </TableHeader>
            <tbody>
              {devTable.rows.map((d) => (
                <Tr key={d.id} className={cn(d.revokedAt && "opacity-50")}>
                  <Td>
                    <span className="font-medium">{d.name}</span>
                    {d.id === thisId && !d.revokedAt && (
                      <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                        {t("devices.this")}
                      </span>
                    )}
                  </Td>
                  <Td data-label={t("devices.col.station")}>
                    {t(`ws.station.${d.station}` as MsgKey)}
                  </Td>
                  <Td className="text-muted-foreground" data-label={t("devices.col.who")}>
                    {d.revokedAt
                      ? t("devices.revoked", {
                          d: new Date(d.revokedAt).toLocaleDateString(t.lang),
                        })
                      : (who(d.id) ?? t("devices.nobody"))}
                  </Td>
                  <Td
                    className="tabular-nums text-muted-foreground"
                    data-label={t("devices.col.since")}
                  >
                    {new Date(d.createdAt).toLocaleDateString(t.lang)}
                  </Td>
                  <Td className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setJournalOf(d)}>
                      <History />
                      {t("devices.journal")}
                    </Button>
                    {d.revokedAt ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        title={t("devices.forgetHint")}
                        onClick={() => void forget(d.id)}
                      >
                        <Trash2 />
                        {t("devices.forget")}
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setRevoking(d)}
                      >
                        <Power />
                        {t("devices.revoke")}
                      </Button>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
      {journalOf && (
        <DeviceJournal
          device={journalOf}
          who={who(journalOf.id)}
          onClose={() => setJournalOf(null)}
        />
      )}
      {revoking && (
        <RevokeDevice device={revoking} who={who(revoking.id)} onClose={() => setRevoking(null)} />
      )}
    </ScreenShell>
  );
}
