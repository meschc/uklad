import {
  journalQuery,
  localJournal,
  type ActivityEntry,
  type JournalFilters,
} from "../activityJournal";
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
}

const isEntry = (v: unknown): v is ActivityEntry => {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return typeof e.id === "string" && typeof e.at === "number" && typeof e.kind === "string";
};

function createJournalRepository(port: StorePort = storePort): JournalRepository {
  return {
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
      if (status === 403) return fail("journal.forbidden");
      if (status !== 200 || !Array.isArray(body.entries)) return fail("data.failed");
      return ok({
        entries: (body.entries as unknown[]).filter(isEntry),
        next: typeof body.next === "number" ? body.next : null,
      });
    },
  };
}

export const journalRepository = createJournalRepository();
