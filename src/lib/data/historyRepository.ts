import { apiRequest } from "./api";
import { attempt, fail, ok, type Result } from "./result";

/**
 * Архив законченной работы на сервере (окно истории, ADR 0010, шаг 3).
 *
 * Кабинет при входе получает живую работу и последние 45 дней: уехавшие
 * заявки, закрытые поставки, рейсы, приёмку и журнал смен старше окна сервер
 * держит в архиве (`server/api/src/cabinet/records.js`, `archiveRecords`).
 * Отчётам за долгий период он отдаёт их отдельно, страницами
 * (`GET /api/cabinet/history`). В браузере архив не сохраняется: он живёт в
 * памяти, пока открыт кабинет (`store/archive.ts`).
 */
export interface ArchiveRow {
  /** Склад (`warehouse.id`); пустая строка — список всей компании. */
  w: string;
  /** Список кабинета: `requests`, `staffEvents`… */
  d: string;
  ref: string;
  /** Место в списке, когда строка ушла в архив. */
  pos: number;
  data: Record<string, unknown>;
}

/** Больше страниц за раз не берём: это сотни тысяч строк, а не отчёт. */
const MAX_PAGES = 200;

export const historyRepository = {
  /**
   * Весь архив компании. `forbidden` — этому входу архив не положен (стол,
   * продавец): отчёт показывает окно, а не ошибку.
   */
  load: async (): Promise<Result<ArchiveRow[] | "forbidden">> => {
    const rows: ArchiveRow[] = [];
    let after: string | null = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const path: string = after
        ? `/cabinet/history?after=${encodeURIComponent(after)}`
        : "/cabinet/history";
      const res = await attempt(() => apiRequest("GET", path), "sync.err.network");
      if (!res.ok) return res;
      const { status, body } = res.data;
      if (status === 403) return ok("forbidden");
      if (status !== 200 || !Array.isArray(body.rows)) return fail("sync.err.network");
      for (const r of body.rows as unknown[]) if (isRow(r)) rows.push(r);
      if (typeof body.next !== "string") return ok(rows);
      after = body.next;
    }
    return ok(rows);
  },
};

function isRow(v: unknown): v is ArchiveRow {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.w === "string" &&
    typeof r.d === "string" &&
    typeof r.ref === "string" &&
    typeof r.pos === "number" &&
    typeof r.data === "object" &&
    r.data !== null &&
    !Array.isArray(r.data)
  );
}
