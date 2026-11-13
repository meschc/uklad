import type { StaffEvent, StaffMember, WorkstationKind } from "./types";
import { processMs } from "./staffProcess";
import { earnings, idleMs, peaksByStaff, workedMs } from "./workstation";
import { cell } from "./staffIO";

/**
 * Выработка сотрудников за период: часы на смене, простой, пики по участкам,
 * ошибки и брак при упаковке, сумма по почасовой ставке.
 *
 * Всё считается из журнала смен (`staffEvents`), новых данных не нужно.
 * Оплату по пикам здесь не считаем: схемы у складов разные (повременка с
 * премией, сдельно, бригадой), формула появится, когда её скажет склад.
 * Пока склад сам считает зарплату по выгрузке (`staffReportCsv`) в своём
 * Excel или 1С. Без ставки сумма — «нет данных» (`null`), а не ноль.
 */
export interface StaffOutput {
  staffId: string;
  name: string;
  role: string;
  workedMs: number;
  /** Часы на смене по участкам: сам перешёл — часы ушли новому участку. */
  byStation: Partial<Record<WorkstationKind, number>>;
  idleMs: number;
  packed: number;
  picked: number;
  errors: number;
  rejects: number;
  rate: number | null;
  earned: number | null;
}

export function staffReport(
  events: readonly StaffEvent[],
  staff: readonly StaffMember[],
  from: number,
  to: number,
): StaffOutput[] {
  const peaks = peaksByStaff(events, from, to);
  const faults = new Map<string, { errors: number; rejects: number }>();
  for (const e of events) {
    if (e.at < from || e.at >= to) continue;
    if (e.type !== "pack_error" && e.type !== "pack_reject") continue;
    const f = faults.get(e.staffId) ?? { errors: 0, rejects: 0 };
    if (e.type === "pack_error") f.errors += 1;
    else f.rejects += 1;
    faults.set(e.staffId, f);
  }
  return staff.map((m) => {
    const worked = workedMs(events, m.id, from, to);
    const p = peaks.get(m.id);
    const f = faults.get(m.id);
    return {
      staffId: m.id,
      name: m.name,
      role: m.role,
      workedMs: worked,
      byStation: processMs(events, m.id, from, to),
      idleMs: idleMs(events, m.id, from, to),
      packed: p?.pack ?? 0,
      picked: p?.pick ?? 0,
      errors: f?.errors ?? 0,
      rejects: f?.rejects ?? 0,
      rate: m.hourlyRate && m.hourlyRate > 0 ? m.hourlyRate : null,
      earned: earnings(worked, m.hourlyRate),
    };
  });
}

/** Часы с двумя знаками и запятой: так их читает русский Excel. */
const hours = (ms: number) => (ms / 3_600_000).toFixed(2).replace(".", ",");

const STAFF_REPORT_HEADERS = [
  "Сотрудник",
  "Должность",
  "Часы на смене",
  "Простой, ч",
  "Упаковано, шт",
  "Собрано, шт",
  "Пики всего",
  "Ошибки упаковки",
  "Брак",
  "Ставка, ₽/ч",
  "По ставке, ₽",
  "Часы по участкам",
];

/** Участки в выгрузке — по-русски, как и колонки. */
const STATION_RU: Record<WorkstationKind, string> = {
  pack: "Упаковка",
  receiving: "Приёмка",
  picking: "Сборка",
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
      hours(r.idleMs),
      String(r.packed),
      String(r.picked),
      String(r.packed + r.picked),
      String(r.errors),
      String(r.rejects),
      r.rate == null ? "" : String(r.rate),
      r.earned == null ? "" : String(r.earned),
      byStationText(r.byStation),
    ]
      .map(cell)
      .join(";"),
  );
  return [STAFF_REPORT_HEADERS.join(";"), ...body].join("\n");
}
