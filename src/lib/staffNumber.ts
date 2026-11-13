import type { StaffMember } from "./types";

/**
 * Табельные номера склада. У кого номер записан — тот; у старых записей без
 * номера — следующие за наибольшим по порядку списка, чтобы номер на бейдже
 * и в таблице был у каждого и не совпадал с чужим.
 */
export function staffNumbers(staff: readonly StaffMember[]): Map<string, number> {
  const out = new Map<string, number>();
  let max = 0;
  for (const m of staff) if (m.number && m.number > max) max = m.number;
  for (const m of staff) out.set(m.id, m.number && m.number > 0 ? m.number : ++max);
  return out;
}

/** Номер для нового сотрудника: следующий за всеми выданными. */
export const nextStaffNumber = (staff: readonly StaffMember[]): number =>
  Math.max(0, ...staffNumbers(staff).values()) + 1;
