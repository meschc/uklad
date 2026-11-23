import { describe, expect, it } from "vitest";
import { AUDIT_KINDS, JOURNAL_STEPS, type ActivityEntry } from "@/lib/activityJournal";
import { ru, en } from "@/lib/i18n/journal";
import { actionKey } from "../journalText";

const entry = (kind: string): ActivityEntry => ({
  id: "a1",
  at: 1,
  receivedAt: 1,
  source: "audit",
  staffRef: null,
  kind,
  step: "admin",
  counted: false,
  flagged: false,
});

describe("действия руководителей в журнале", () => {
  it("у каждого вида, который пишет сервер, есть подпись ru и en", () => {
    for (const kind of AUDIT_KINDS) {
      const key = actionKey(entry(kind));
      expect(key).toBe(`journal.audit.${kind}`);
      expect(ru).toHaveProperty([key]);
      expect(en).toHaveProperty([key]);
    }
  });

  it("незнакомый вид (сервер новее кабинета) — общая подпись, а не ключ как есть", () => {
    expect(actionKey(entry("vault.open"))).toBe("journal.audit.other");
  });

  it("процесс «Действия руководителей» есть в фильтре", () => {
    expect(JOURNAL_STEPS).toContain("admin");
    expect(ru).toHaveProperty(["journal.step.admin"]);
  });
});
