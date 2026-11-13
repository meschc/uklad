import { useEffect, useState } from "react";
import { History, X } from "lucide-react";
import { useEditor } from "@/lib/store";
import { workstationRepository } from "@/lib/data";
import type { DeviceJournalEntry } from "@/lib/data/deskServer";
import { groupJournal } from "@/lib/deviceJournal";
import { useT, type MsgKey } from "@/lib/i18n";
import type { Device } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { DialogHeader, DialogShell } from "@/components/ui/dialog-shell";
import { eyebrow } from "@/components/ui/eyebrow";

/** Виды операций стола на сервере (`desk_ops.kind`) — подписи в словаре. */
const SERVER_KINDS = new Set([
  "shift_mark",
  "shift_undo",
  "pack_event",
  "pack_done",
  "pick_unit",
  "pick_done",
  "recv_open",
  "recv_unit",
  "recv_place",
  "recv_attach",
  "recv_close",
  "recv_cargo",
  "ship_run",
  "dispute_resolve",
]);

/**
 * Журнал устройства: кто за ним сейчас и кто работал раньше. Тот же журнал
 * операций, что у сотрудника, только по устройству: на сервере — операции
 * стола (миграция 026), в демо — отметки и сканы с этого устройства.
 */
export function DeviceJournal({
  device,
  who,
  onClose,
}: {
  device: Device;
  who: string | null;
  onClose: () => void;
}) {
  const t = useT();
  const staff = useEditor((s) => s.warehouse.staff) ?? [];
  const [entries, setEntries] = useState<DeviceJournalEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    void workstationRepository.deviceJournal(device.id).then((res) => {
      if (!live) return;
      if (res.ok) setEntries(res.data);
      else setFailed(true);
    });
    return () => {
      live = false;
    };
  }, [device.id]);

  const name = (ref: string | null) =>
    (ref && staff.find((m) => m.id === ref)?.name) || t("devices.journal.nobody");
  const kind = (k: string) => t((SERVER_KINDS.has(k) ? `devices.op.${k}` : `ws.ev.${k}`) as MsgKey);
  const time = (ms: number) =>
    new Date(ms).toLocaleTimeString(t.lang, { hour: "2-digit", minute: "2-digit" });
  const day = (ms: number) => new Date(ms).toLocaleDateString(t.lang);
  const stints = entries ? groupJournal(entries) : [];

  return (
    <DialogShell size="lg" scroll onClose={onClose}>
      <DialogHeader>
        <div className="flex min-w-0 items-center gap-2">
          <History className="size-4 text-muted-foreground" />
          <p className="truncate text-sm font-semibold">
            {t("devices.journal.title", { name: device.name })}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t("support.close")}>
          <X className="size-4" />
        </Button>
      </DialogHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
        <section className="flex flex-col gap-1">
          <h3 className={eyebrow()}>{t("devices.col.who")}</h3>
          <p className="text-sm font-medium">{who ?? t("devices.nobody")}</p>
        </section>
        <section className="flex flex-col gap-3">
          <h3 className={eyebrow()}>{t("devices.journal.before")}</h3>
          {failed ? (
            <p className="text-sm text-destructive">{t("data.failed")}</p>
          ) : !entries ? (
            <p className="text-sm text-muted-foreground">{t("data.busy")}</p>
          ) : stints.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("devices.journal.empty")}</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {stints.map((s) => (
                <li key={`${s.staffRef}-${s.from}`} className="flex flex-col gap-0.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium">{name(s.staffRef)}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {day(s.from)} · {time(s.from)}–{time(s.to)}
                    </span>
                  </div>
                  {/* Сколько раз человек сделал это действие с устройства. */}
                  <p className="text-xs text-muted-foreground">
                    {Object.entries(s.kinds)
                      .map(
                        ([k, n]) =>
                          `${kind(k)} — ${n} ${t.plural(n, ["раз", "раза", "раз"], ["time", "times"])}`,
                      )
                      .join(" · ")}
                  </p>
                  {s.flagged > 0 && (
                    <p className="text-xs text-warning">
                      {t("devices.journal.flagged", { n: s.flagged })}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </DialogShell>
  );
}
