import type { BreakPolicy, PayAdjustment, StaffEvent, StaffMember, WorkstationKind } from "./types";
import { paidMs } from "./paidHours";
import { adjustmentTotals, autoAllowances, specialHours } from "./payExtras";
import { processMs } from "./staffProcess";
import { earnings, idleMs, peaksByStaff, workedMs } from "./workstation";
import { cell } from "./staffIO";

/**
 * Выработка сотрудников за период: часы на смене, простой, пики по участкам,
 * ошибки и брак при упаковке, сумма по почасовой ставке за оплачиваемые
 * часы (`paidHours.ts`: час обеда за смену не оплачивается).
 *
 * Всё считается из журнала смен (`staffEvents`), новых данных не нужно.
 * Оплату по пикам здесь не считаем: схемы у складов разные (повременка с
 * премией, сдельно, бригадой), формула появится, когда её скажет склад.
 * Пока склад сам считает зарплату по выгрузке (`staffReportCsv`) в своём
 * Excel или 1С. Без ставки сумма — «нет данных» (`null`), а не ноль.
 *
 * К сумме по ставке прибавляются надбавки за ночные и праздничные часы и
 * корректировки старшего (`payExtras.ts`): «к выплате» = по ставке + надбавки
 * + премии − удержания.
 */
export interface StaffOutput {
  staffId: string;
  name: string;
  role: string;
  workedMs: number;
  /** Оплачиваемые часы: смена без неоплачиваемой нормы перерыва. По ним — сумма. */
  paidMs: number;
  /** Часы на смене по участкам: сам перешёл — часы ушли новому участку. */
  byStation: Partial<Record<WorkstationKind, number>>;
  idleMs: number;
  packed: number;
  picked: number;
  errors: number;
  rejects: number;
  /** Перепечатки этикеток: без подтверждения, но старший их видит. */
  reprints: number;
  rate: number | null;
  earned: number | null;
  /** Часы на смене с 22:00 до 06:00 и в нерабочие праздники. */
  nightMs: number;
  holidayMs: number;
  /** Надбавки по ставке за эти часы, ₽; без ставки — null. */
  nightPay: number | null;
  holidayPay: number | null;
  /** Корректировки старшего за период, ₽. */
  bonus: number;
  allowance: number;
  deduction: number;
  /** По ставке + надбавки + премии − удержания; без ставки — null. */
  toPay: number | null;
}

export function staffReport(
  events: readonly StaffEvent[],
  staff: readonly StaffMember[],
  from: number,
  to: number,
  policy?: Pick<BreakPolicy, "unpaidMin" | "nightPct" | "holidayPct">,
  adjustments: readonly PayAdjustment[] = [],
): StaffOutput[] {
  const peaks = peaksByStaff(events, from, to);
  const faults = new Map<string, { errors: number; rejects: number; reprints: number }>();
  const FAULT = { pack_error: "errors", pack_reject: "rejects", pack_reprint: "reprints" } as const;
  for (const e of events) {
    if (e.at < from || e.at >= to) continue;
    const key = FAULT[e.type as keyof typeof FAULT];
    if (!key) continue;
    const f = faults.get(e.staffId) ?? { errors: 0, rejects: 0, reprints: 0 };
    f[key] += 1;
    faults.set(e.staffId, f);
  }
  return staff.map((m) => {
    const worked = workedMs(events, m.id, from, to);
    const paid = paidMs(events, m.id, from, to, policy);
    const p = peaks.get(m.id);
    const f = faults.get(m.id);
    const rate = m.hourlyRate && m.hourlyRate > 0 ? m.hourlyRate : null;
    const earned = earnings(paid, m.hourlyRate);
    const special = specialHours(events, m.id, from, to);
    const auto = autoAllowances(special, rate, policy);
    const adj = adjustmentTotals(adjustments, m.id, from, to);
    return {
      staffId: m.id,
      name: m.name,
      role: m.role,
      workedMs: worked,
      paidMs: paid,
      byStation: processMs(events, m.id, from, to),
      idleMs: idleMs(events, m.id, from, to),
      packed: p?.pack ?? 0,
      picked: p?.pick ?? 0,
      errors: f?.errors ?? 0,
      rejects: f?.rejects ?? 0,
      reprints: f?.reprints ?? 0,
      rate,
      earned,
      ...special,
      nightPay: auto.night,
      holidayPay: auto.holiday,
      ...adj,
      toPay:
        earned == null
          ? null
          : earned +
            (auto.night ?? 0) +
            (auto.holiday ?? 0) +
            adj.bonus +
            adj.allowance -
            adj.deduction,
    };
  });
}

/** Часы с двумя знаками и запятой: так их читает русский Excel. */
const hours = (ms: number) => (ms / 3_600_000).toFixed(2).replace(".", ",");

/** Сумма без ставки — пустая ячейка, а не ноль. */
const money = (v: number | null) => (v == null ? "" : String(v));

const STAFF_REPORT_HEADERS = [
  "Сотрудник",
  "Должность",
  "Часы на смене",
  "Оплачиваемые часы",
  "Простой, ч",
  "Упаковано, шт",
  "Собрано, шт",
  "Пики всего",
  "Ошибки упаковки",
  "Брак",
  "Перепечатки",
  "Ставка, ₽/ч",
  "По ставке, ₽",
  "Ночные, ч",
  "Ночные, ₽",
  "Праздничные, ч",
  "Праздничные, ₽",
  "Премии, ₽",
  "Надбавки, ₽",
  "Удержания, ₽",
  "К выплате, ₽",
  "Часы по участкам",
];

/** Участки в выгрузке — по-русски, как и колонки. */
const STATION_RU: Record<WorkstationKind, string> = {
  pack: "Упаковка",
  receiving: "Приёмка",
  picking: "Сборка",
  sorting: "Сортировка",
  marking: "Маркировка",
  returns: "Возвраты",
  shipping: "Отгрузка",
  inventory: "Инвентаризация",
};

const byStationText = (b: StaffOutput["byStation"]) =>
  (Object.keys(STATION_RU) as WorkstationKind[])
    .filter((k) => (b[k] ?? 0) > 0)
    .map((k) => `${STATION_RU[k]} ${hours(b[k] ?? 0)}`)
    .join(" · ");

/**
 * Выгрузка для расчёта зарплаты. Колонки — по-русски, разделитель «;»: файл
 * открывают в Excel и 1С у склада. Пустая ставка — пустая ячейка, не ноль.
 */
export function staffReportCsv(rows: readonly StaffOutput[]): string {
  const body = rows.map((r) =>
    [
      r.name,
      r.role,
      hours(r.workedMs),
      hours(r.paidMs),
      hours(r.idleMs),
      String(r.packed),
      String(r.picked),
      String(r.packed + r.picked),
      String(r.errors),
      String(r.rejects),
      String(r.reprints),
      r.rate == null ? "" : String(r.rate),
      money(r.earned),
      hours(r.nightMs),
      money(r.nightPay),
      hours(r.holidayMs),
      money(r.holidayPay),
      String(r.bonus),
      String(r.allowance),
      String(r.deduction),
      money(r.toPay),
      byStationText(r.byStation),
    ]
      .map(cell)
      .join(";"),
  );
  return [STAFF_REPORT_HEADERS.join(";"), ...body].join("\n");
}
