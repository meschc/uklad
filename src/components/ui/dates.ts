/** Дата в форме системного поля: `ГГГГ-ММ-ДД`. */
export type IsoDate = string;

export interface DateRange {
  from: IsoDate;
  to: IsoDate;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Местная дата (не UTC): полночь по Москве не должна уехать во вчера. */
export const toIso = (d: Date): IsoDate =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const fromIso = (s: IsoDate): Date | undefined => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined;
};
