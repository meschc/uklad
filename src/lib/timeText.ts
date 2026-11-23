/**
 * Время, набранное с клавиатуры, → минуты от полуночи. «1300» → 13:00,
 * «930» → 09:30, «9» → 09:00, «9:5» → 09:05. Часы не больше 23, минуты не
 * больше 59, иначе `null`. Конец раньше начала — это ночная смена, её
 * считает вызывающий по кругу суток (`BreakPolicyCard`), здесь только ввод.
 */
export function parseTimeText(text: string): number | null {
  const raw = text.trim();
  if (!raw) return null;
  let h: string;
  let m: string;
  if (/[:.,\s]/.test(raw)) {
    const parts = raw.split(/[:.,\s]+/);
    if (parts.length !== 2) return null;
    [h, m] = parts as [string, string];
  } else {
    if (!/^\d{1,4}$/.test(raw)) return null;
    if (raw.length <= 2) {
      h = raw;
      m = "0";
    } else {
      h = raw.slice(0, raw.length - 2);
      m = raw.slice(-2);
    }
  }
  if (!/^\d{1,2}$/.test(h) || !/^\d{1,2}$/.test(m)) return null;
  const hh = Number(h);
  const mm = Number(m);
  if (hh > 23 || mm > 59) return null;
  return hh * 60 + mm;
}

/** Минуты от полуночи → «13:00» (по кругу суток). */
export function formatTimeText(min: number): string {
  const v = ((Math.round(min) % 1440) + 1440) % 1440;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(v / 60))}:${p(v % 60)}`;
}
