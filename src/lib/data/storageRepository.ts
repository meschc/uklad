import type { StorageRow } from "../storage";
import { apiRequest } from "./api";
import { attempt, fail, ok, type Result } from "./result";

/**
 * Сутки хранения с сервера (миграция 037, `GET /api/cabinet/storage`):
 * занятость склада по продавцам за период и последняя строка до него — по ней
 * отчёт знает, что лежало в первые дни периода без записей.
 */
export const storageRepository = {
  /** `forbidden` — этому входу ставки и счёт не положены: отчёт без хранения. */
  load: async (
    warehouseId: string,
    from: string,
    to: string,
  ): Promise<Result<StorageRow[] | "forbidden">> => {
    const q = new URLSearchParams({ from, to, warehouse: warehouseId });
    const res = await attempt(
      () => apiRequest("GET", `/cabinet/storage?${q.toString()}`),
      "sync.err.network",
    );
    if (!res.ok) return res;
    const { status, body } = res.data;
    if (status === 403) return ok("forbidden");
    if (status !== 200 || !Array.isArray(body.rows)) return fail("sync.err.network");
    return ok((body.rows as unknown[]).filter(isRow));
  },
};

function isRow(v: unknown): v is StorageRow {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.day === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(r.day) &&
    typeof r.partner === "string" &&
    Number.isInteger(r.pallets) &&
    Number.isInteger(r.boxes)
  );
}
