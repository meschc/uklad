import type { DeviceJournalEntry } from "./data/deskServer";

/**
 * Журнал устройства кусками «кто сидел за столом»: подряд идущие операции
 * одного человека — одна строка с началом, концом и счётом по видам. Сотня
 * строк «скан, скан, скан» не отвечает на вопрос «кто тут работал».
 */
export interface JournalStint {
  staffRef: string | null;
  from: number;
  to: number;
  count: number;
  /** Вид операции → сколько раз. */
  kinds: Record<string, number>;
  flagged: number;
}

/** Перерыв дольше этого — новая строка, даже если человек тот же. */
const GAP_MS = 2 * 60 * 60 * 1000;

/** `entries` — новые сверху, как отдаёт сервер; строки — тоже новые сверху. */
export function groupJournal(entries: readonly DeviceJournalEntry[]): JournalStint[] {
  const out: JournalStint[] = [];
  for (const e of entries) {
    const cur = out.at(-1);
    if (cur && cur.staffRef === e.staffRef && cur.from - e.at <= GAP_MS) {
      cur.from = e.at;
      cur.count++;
      cur.kinds[e.kind] = (cur.kinds[e.kind] ?? 0) + 1;
      if (e.flagged) cur.flagged++;
    } else {
      out.push({
        staffRef: e.staffRef,
        from: e.at,
        to: e.at,
        count: 1,
        kinds: { [e.kind]: 1 },
        flagged: e.flagged ? 1 : 0,
      });
    }
  }
  return out;
}
