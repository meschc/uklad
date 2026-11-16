import type { DeviceEvent, DeviceJournalEntry } from "./data/deskServer";
import type { Device } from "./types";

/**
 * Журнал устройства по людям (Кирилл 13.11): строка — человек и когда он
 * работал, под ней раскрывается список его действий, как в журнале рабочего
 * места. События самого устройства (привязали, отвязали) — строки того же
 * уровня, что человек: их делал не тот, кто сидел за столом.
 */
export interface JournalStint {
  type: "stint";
  staffRef: string | null;
  from: number;
  to: number;
  /** Действия, новые сверху. */
  entries: DeviceJournalEntry[];
  flagged: number;
}

interface JournalDeviceEvent {
  type: "device";
  kind: "bound" | "revoked";
  at: number;
  /** Кто привязал или отвязал: имя руководителя или сотрудник по бейджу. */
  byName?: string;
  byStaff?: string;
}

export type JournalRow = JournalStint | JournalDeviceEvent;

/** Перерыв дольше этого — новая строка, даже если человек тот же. */
const GAP_MS = 2 * 60 * 60 * 1000;

/**
 * `entries` — новые сверху, как отдаёт сервер; строки — тоже новые сверху.
 * Событие устройства посреди работы человека делит её на две строки.
 * `events` — с сервера, с тем, кто это сделал (новые сверху); нет их —
 * отметки самого устройства.
 */
export function journalRows(
  entries: readonly DeviceJournalEntry[],
  device?: Pick<Device, "createdAt" | "revokedAt">,
  events?: readonly DeviceEvent[],
): JournalRow[] {
  const marks: JournalDeviceEvent[] = [];
  if (events) {
    for (const e of events) marks.push({ type: "device", ...e });
    marks.sort((a, b) => b.at - a.at);
  } else {
    if (device?.revokedAt) marks.push({ type: "device", kind: "revoked", at: device.revokedAt });
    if (device?.createdAt) marks.push({ type: "device", kind: "bound", at: device.createdAt });
  }
  const out: JournalRow[] = [];
  let m = 0;
  for (const e of entries) {
    while (m < marks.length && marks[m].at >= e.at) out.push(marks[m++]);
    const cur = out.at(-1);
    if (cur?.type === "stint" && cur.staffRef === e.staffRef && cur.from - e.at <= GAP_MS) {
      cur.from = e.at;
      cur.entries.push(e);
      if (e.flagged) cur.flagged++;
    } else {
      out.push({
        type: "stint",
        staffRef: e.staffRef,
        from: e.at,
        to: e.at,
        entries: [e],
        flagged: e.flagged ? 1 : 0,
      });
    }
  }
  while (m < marks.length) out.push(marks[m++]);
  return out;
}
