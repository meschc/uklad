import { isSenior, pickDocSources as sourcesOf, resolveDoc } from "../docFlow";
import type { DocRecord } from "../types";
import { nowMs, uid } from "../utils";
import type { DocsSlice, SliceCreator } from "./state";

/**
 * Складские документы: правки черновиков и подтверждение (`docFlow.ts`).
 * Сами документы из операций здесь не хранятся — только то, что люди с ними
 * сделали. Подтверждённый документ не правится: ошибку в нём закрывает
 * корректировка, а не переписывание задним числом.
 */
export const createDocsSlice: SliceCreator<DocsSlice> = (set, get) => ({
  docRecords: [],
  docFocus: null,

  openDoc: (kind, sourceId) => {
    set({ docFocus: { kind, sourceId } });
    get().goToView("documents");
  },
  clearDocFocus: () => set({ docFocus: null }),

  saveDocDraft: (kind, sourceId, edits) => {
    const s = get();
    const prev = s.docRecords.find((r) => r.kind === kind && r.sourceId === sourceId);
    if (prev?.status === "confirmed") return false;
    if (!resolveDoc(kind, sourceId, sourcesOf(s))) return false;
    const next: DocRecord = prev
      ? { ...prev, edits: { ...prev.edits, ...edits }, updatedAt: nowMs() }
      : { id: uid("doc"), kind, sourceId, status: "draft", edits, updatedAt: nowMs() };
    set({
      docRecords: prev ? s.docRecords.map((r) => (r === prev ? next : r)) : [...s.docRecords, next],
    });
    return true;
  },

  confirmDoc: (kind, sourceId, staffId) => {
    const s = get();
    const member = (s.warehouse.staff ?? []).find((m) => m.id === staffId);
    if (!isSenior(member)) return "notSenior";
    const prev = s.docRecords.find((r) => r.kind === kind && r.sourceId === sourceId);
    if (prev?.status === "confirmed") return "locked";
    const snapshot = resolveDoc(kind, sourceId, sourcesOf(s), prev);
    if (!snapshot) return "missing";
    const now = nowMs();
    const next: DocRecord = {
      id: prev?.id ?? uid("doc"),
      kind,
      sourceId,
      status: "confirmed",
      edits: prev?.edits ?? {},
      updatedAt: now,
      confirmedAt: now,
      confirmedBy: staffId,
      snapshot,
    };
    set({
      docRecords: prev ? s.docRecords.map((r) => (r === prev ? next : r)) : [...s.docRecords, next],
    });
    return "ok";
  },
});
