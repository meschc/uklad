import type { DocEdits, DocRecord } from "../types";
import { storePort, type StorePort } from "./repository";
import { attempt, fail, ok, type Result } from "./result";

type Kind = DocRecord["kind"];

/**
 * Складские документы (п.0.4): правка черновика и подтверждение. Здесь
 * появится сеть — подтверждение станет запросом, который сервер пускает только
 * с правом `docs.confirm`; экран при этом не поменяется.
 */
export interface DocumentsRepository {
  /** Правка черновика. Подтверждённый документ — отказ `doc.err.locked`. */
  saveDraft: (kind: Kind, sourceId: string, edits: DocEdits) => Promise<Result<void>>;
  /** Подтверждение. Не старший — `doc.err.notSenior`. */
  confirm: (kind: Kind, sourceId: string, staffId: string) => Promise<Result<void>>;
}

export function createDocumentsRepository(port: StorePort = storePort): DocumentsRepository {
  return {
    saveDraft: async (kind, sourceId, edits) => {
      const res = await attempt(() => port.get().saveDocDraft(kind, sourceId, edits));
      if (!res.ok) return res;
      return res.data ? ok(undefined) : fail("doc.err.locked");
    },
    confirm: async (kind, sourceId, staffId) => {
      const res = await attempt(() => port.get().confirmDoc(kind, sourceId, staffId));
      if (!res.ok) return res;
      if (res.data === "ok") return ok(undefined);
      return fail(
        res.data === "notSenior"
          ? "doc.err.notSenior"
          : res.data === "locked"
            ? "doc.err.locked"
            : "doc.err.missing",
      );
    },
  };
}

export const documentsRepository = createDocumentsRepository();
