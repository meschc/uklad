import type { StaffEvent, WorkstationKind } from "./types";
import { shiftState } from "./workstation";

/**
 * Участок сотрудника — по тому, где он работает, а не по должности.
 *
 * Перешёл человек с упаковки на сборку — участок меняется сам: каждая
 * отметка и каждый скан в журнале смен несут рабочее место (`station`), и
 * участок — это место последнего такого события в текущей смене. Никто не
 * переключает его руками. Права при этом не меняются: что человеку можно,
 * решает его роль (миграция 024), а участок — только где он сейчас и
 * сколько часов где отработал (основа для коэффициента процесса в оплате).
 */

const MARKS = new Set<StaffEvent["type"]>([
  "shift_start",
  "break_start",
  "break_end",
  "idle_start",
  "idle_end",
  "shift_end",
]);

const own = (events: readonly StaffEvent[], staffId: string) =>
  events.filter((e) => e.staffId === staffId).sort((a, b) => a.at - b.at);

export interface CurrentProcess {
  station: WorkstationKind;
  /** С какого момента человек на этом участке без перерыва на другой. */
  since: number;
}

/** Где человек работает сейчас; не на смене или участок не известен — `null`. */
export function currentProcess(
  events: readonly StaffEvent[],
  staffId: string,
): CurrentProcess | null {
  if (shiftState(events, staffId) === "off") return null;
  const list = own(events, staffId);
  let start = 0;
  list.forEach((e, i) => {
    if (e.type === "shift_start") start = i;
  });
  const placed = list.slice(start).filter((e) => e.station);
  const last = placed.at(-1);
  if (!last?.station) return null;
  let since = last.at;
  for (let i = placed.length - 1; i >= 0 && placed[i].station === last.station; i--) {
    since = placed[i].at;
  }
  return { station: last.station, since };
}

/**
 * Рабочие часы окна [from, to) по участкам: отрезок «на смене» принадлежит
 * участку последнего события перед ним. Перерыв и простой не входят — как в
 * `workedMs`. Время, пока участок ещё не известен (смена открыта с телефона,
 * а первого скана не было), отдаётся первому участку смены.
 */
export function processMs(
  events: readonly StaffEvent[],
  staffId: string,
  from: number,
  to: number,
): Partial<Record<WorkstationKind, number>> {
  const out: Partial<Record<WorkstationKind, number>> = {};
  const list = own(events, staffId);
  let on = false;
  let station: WorkstationKind | undefined;
  let pending = 0; // часы смены до первого известного участка
  let since = 0;
  const add = (end: number) => {
    if (!on) return;
    const ms = Math.max(0, Math.min(end, to) - Math.max(since, from));
    if (ms === 0) return;
    if (station) out[station] = (out[station] ?? 0) + ms;
    else pending += ms;
  };
  for (const e of list) {
    if (e.at >= to) break;
    if (!MARKS.has(e.type) && (!e.station || e.station === station)) continue;
    add(e.at);
    since = e.at;
    if (e.type === "shift_start") {
      station = undefined;
      pending = 0;
    }
    if (e.station && e.station !== station) {
      if (!station && pending > 0) out[e.station] = (out[e.station] ?? 0) + pending;
      pending = 0;
      station = e.station;
    }
    if (MARKS.has(e.type)) {
      on = e.type === "shift_start" || e.type === "break_end" || e.type === "idle_end";
    }
  }
  add(to);
  return out;
}
