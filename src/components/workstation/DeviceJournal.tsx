import { useEffect, useState } from "react";
import { ChevronRight, History, Link2, Unlink, X } from "lucide-react";
import { useEditor } from "@/lib/store";
import { workstationRepository } from "@/lib/data";
import type { DeviceJournalEntry } from "@/lib/data/deskServer";
import { journalRows, type JournalStint } from "@/lib/deviceJournal";
import { useT, type MsgKey } from "@/lib/i18n";
import type { Device } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { DialogHeader, DialogShell } from "@/components/ui/dialog-shell";
import { eyebrow } from "@/components/ui/eyebrow";
import { cn } from "@/lib/utils";
import { JournalActions } from "./JournalActions";

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
  const time = (ms: number, sec = false) =>
    new Date(ms).toLocaleTimeString(t.lang, {
      hour: "2-digit",
      minute: "2-digit",
      ...(sec ? { second: "2-digit" } : {}),
    });
  const day = (ms: number) => new Date(ms).toLocaleDateString(t.lang);
  const rows = entries ? journalRows(entries, device) : [];

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
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("devices.journal.empty")}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {rows.map((r) =>
                r.type === "device" ? (
                  <li
                    key={`${r.kind}-${r.at}`}
                    className="flex items-center justify-between gap-3 px-2 py-1.5"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                      {r.kind === "bound" ? (
                        <Link2 className="size-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <Unlink className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      {t(`devices.journal.${r.kind}`)}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {day(r.at)} · {time(r.at)}
                    </span>
                  </li>
                ) : (
                  <Stint
                    key={`${r.staffRef}-${r.from}`}
                    stint={r}
                    name={name(r.staffRef)}
                    kind={kind}
                    time={time}
                    day={day}
                  />
                ),
              )}
            </ul>
          )}
        </section>
      </div>
    </DialogShell>
  );
}

/**
 * Человек за устройством: имя и время работы, под ними — раскрывающийся
 * список его действий, как в журнале рабочего места.
 */
function Stint({
  stint,
  name,
  kind,
  time,
  day,
}: {
  stint: JournalStint;
  name: string;
  kind: (k: string) => string;
  time: (ms: number, sec?: boolean) => string;
  day: (ms: number) => string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const n = stint.entries.length;
  return (
    <li className="flex flex-col">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left hover:bg-muted/60"
      >
        <span className="flex min-w-0 items-center gap-2">
          <ChevronRight
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-90",
            )}
          />
          <span className="truncate text-sm font-medium">{name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {n} {t.plural(n, ["действие", "действия", "действий"], ["action", "actions"])}
          </span>
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {day(stint.from)} · {time(stint.from)}–{time(stint.to)}
        </span>
      </button>
      {stint.flagged > 0 && (
        <p className="pl-8 text-xs text-warning">
          {t("devices.journal.flagged", { n: stint.flagged })}
        </p>
      )}
      {open && (
        <div className="pb-2 pl-4">
          <JournalActions
            items={stint.entries.map((e, i) => ({
              key: `${e.at}-${i}`,
              time: time(e.at, true),
              label: kind(e.kind),
              tone: e.flagged ? ("warn" as const) : undefined,
            }))}
          />
        </div>
      )}
    </li>
  );
}
