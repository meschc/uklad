import type { InventoryLogEntry } from "../inventoryAct";
import type { CellAddress } from "../types";
import { apiRequest } from "./api";
import { attempt, fail, ok, type Result } from "./result";

/**
 * Журнал пересчётов с сервера (`GET /api/cabinet/inventory`, `inventoryLog.js`)
 * — числа, из которых собирается акт инвентаризации. Сутки — `YYYY-MM-DD`.
 */
export const inventoryLogRepository = {
  /** `forbidden` — акт с числами учёта этому входу не положен. */
  load: async (from: string, to: string): Promise<Result<InventoryLogEntry[] | "forbidden">> => {
    const q = new URLSearchParams({ from, to });
    const res = await attempt(
      () => apiRequest("GET", `/cabinet/inventory?${q.toString()}`),
      "sync.err.network",
    );
    if (!res.ok) return res;
    const { status, body } = res.data;
    if (status === 403) return ok("forbidden");
    if (status !== 200 || !Array.isArray(body.entries)) return fail("sync.err.network");
    return ok((body.entries as unknown[]).filter(isEntry));
  },
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

const isCell = (v: unknown): v is CellAddress =>
  isObj(v) &&
  typeof v.floorId === "string" &&
  typeof v.moduleId === "string" &&
  Number.isInteger(v.shelfIndex) &&
  Number.isInteger(v.cellIndex);

/** Похоже ли на запись пересчёта — форма, а не схема (`guards.ts`). */
function isEntry(v: unknown): v is InventoryLogEntry {
  if (!isObj(v)) return false;
  return (
    (v.kind === "inv_count" || v.kind === "inv_cell") &&
    typeof v.at === "number" &&
    typeof v.staff === "string" &&
    typeof v.eventId === "string" &&
    (v.boxId === undefined || typeof v.boxId === "string") &&
    (v.cell === undefined || isCell(v.cell)) &&
    Array.isArray(v.lines) &&
    v.lines.every((l) => isObj(l) && typeof l.productId === "string" && typeof l.qty === "number")
  );
}
