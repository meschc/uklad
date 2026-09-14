import type { StaffMember } from "./types";

/**
 * Импорт/экспорт персонала CSV (п.25). Формат простой и человекочитаемый —
 * файл открывается в Excel и правится там же, без отдельного шаблона.
 */

const STAFF_CSV_HEADERS = ["Имя", "Должность", "Телефон", "Почта", "Фото"];

/** Экранирование значения для CSV: кавычки удваиваются. */
function cell(value: string): string {
  return /[",;\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function staffToCsv(staff: StaffMember[]): string {
  const rows = staff.map((m) =>
    [m.name, m.role, m.phone ?? "", m.email ?? "", m.photoUrl ?? ""].map(cell).join(";"),
  );
  return [STAFF_CSV_HEADERS.join(";"), ...rows].join("\n");
}

/** Разбор одной CSV-строки с учётом кавычек. */
function splitRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ";" || ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * Разбор файла в список сотрудников. Строки без имени пропускаем: сотрудник
 * без имени — это мусорная строка, а не запись, которую стоит молча создать.
 */
export function csvToStaff(text: string): Omit<StaffMember, "id">[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const first = splitRow(lines[0]);
  const hasHeader = first[0]?.toLowerCase().startsWith("им") || first[0]?.toLowerCase() === "name";
  return lines
    .slice(hasHeader ? 1 : 0)
    .map(splitRow)
    .filter((r) => r[0])
    .map((r) => ({
      name: r[0],
      role: r[1] ?? "",
      phone: r[2] || undefined,
      email: r[3] || undefined,
      photoUrl: r[4] || undefined,
    }));
}
