import {
  journalQuery,
  localJournal,
  type ActivityEntry,
  type JournalFilters,
} from "../activityJournal";
import {
  localMatches,
  localSteps,
  pathSearchQuery,
  withOrders,
  type PathMatch,
  type PathSearch,
} from "../goodsPath";
import { apiRequest } from "./api";
import { onServer } from "./badgeRepository";
import { storePort, type StorePort } from "./repository";
import { attempt, fail, ok, type Result } from "./result";

/**
 * Журнал действий склада. На сервере — `GET /api/cabinet/journal`
 * (`server/api/src/cabinet/journal.js`): операции столов и правки кабинета
 * этого склада, страница новых сверху. В демо — журнал смен браузера.
 */
interface JournalPage {
  entries: ActivityEntry[];
  /** Курсор следующей страницы (`before`, включительно); нет — дальше пусто. */
  next: number | null;
}

export interface JournalRepository {
  page: (filters: JournalFilters, before?: number) => Promise<Result<JournalPage>>;
  /** «Путь товара»: посылки и заказы, где было то, что ищут, — новые сверху. */
  pathFind: (search: PathSearch) => Promise<Result<PathMatch[]>>;
  /** Лента одной посылки или заказа от приёмки до рейса, по порядку. */
  pathSteps: (match: PathMatch) => Promise<Result<ActivityEntry[]>>;
}

const isMatch = (v: unknown): v is PathMatch => {
  if (typeof v !== "object" || v === null) return false;
  const m = v as Record<string, unknown>;
  return (
    typeof m.id === "string" &&
    typeof m.at === "number" &&
    Array.isArray(m.requestIds) &&
    Array.isArray(m.lines)
  );
};

const isEntry = (v: unknown): v is ActivityEntry => {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return typeof e.id === "string" && typeof e.at === "number" && typeof e.kind === "string";
};

/**
 * Отказ 403 — две разные причины, и у каждой свой выход (правило «почему и как
 * устранить»): у роли нет права или склад не свой (`no_warehouse`).
 */
const forbidden = (body: Record<string, unknown>) =>
  body.error === "no_warehouse" ? "journal.otherWarehouse" : "journal.forbidden";

function createJournalRepository(port: StorePort = storePort): JournalRepository {
  const get = async (path: string) => {
    const res = await attempt(() => apiRequest("GET", path));
    if (!res.ok) return res;
    const { status, body } = res.data;
    if (status === 403) return fail(forbidden(body));
    if (status !== 200) return fail("data.failed");
    return ok(body);
  };
  return {
    pathFind: async (search) => {
      const s = port.get();
      if (!onServer(port)) return ok(localMatches(search, s));
      const res = await get(`/cabinet/goods-path?${pathSearchQuery(s.warehouse.id, search)}`);
      if (!res.ok) return res;
      if (!Array.isArray(res.data.matches)) return fail("data.failed");
      return ok(withOrders((res.data.matches as unknown[]).filter(isMatch), search, s.requests));
    },
    pathSteps: async (match) => {
      const s = port.get();
      if (!onServer(port)) return ok(localSteps(match, s));
      const order = match.id.startsWith("order:") ? match.id.slice("order:".length) : null;
      const p = new URLSearchParams({ warehouse: s.warehouse.id });
      p.set(order ? "order" : "parcel", order ?? match.id);
      const res = await get(`/cabinet/goods-path/steps?${p.toString()}`);
      if (!res.ok) return res;
      if (!Array.isArray(res.data.events)) return fail("data.failed");
      return ok((res.data.events as unknown[]).filter(isEntry));
    },
    page: async (filters, before) => {
      if (!onServer(port)) {
        const edge = before ?? filters.before;
        const entries = localJournal(port.get().staffEvents, { ...filters, before: edge });
        return ok({ entries, next: null });
      }
      const warehouse = port.get().warehouse.id;
      const res = await attempt(() =>
        apiRequest("GET", `/cabinet/journal?${journalQuery(warehouse, filters, before)}`),
      );
      if (!res.ok) return res;
      const { status, body } = res.data;
      if (status === 403) return fail(forbidden(body));
      if (status !== 200 || !Array.isArray(body.entries)) return fail("data.failed");
      return ok({
        entries: (body.entries as unknown[]).filter(isEntry),
        next: typeof body.next === "number" ? body.next : null,
      });
    },
  };
}

export const journalRepository = createJournalRepository();
