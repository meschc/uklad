import { describe, expect, it } from "vitest";
import {
  isJournalError,
  journalQuery,
  localJournal,
  mergeEntries,
  type ActivityEntry,
} from "../activityJournal";
import { viewAllowed } from "@/components/nav/navItems";
import type { StaffEvent } from "../types";

const entry = (id: string, at: number, extra: Partial<ActivityEntry> = {}): ActivityEntry => ({
  id,
  at,
  receivedAt: at,
  source: "desk",
  staffRef: "s1",
  kind: "pack_event",
  step: "pack",
  counted: false,
  flagged: false,
  ...extra,
});

describe("журнал действий", () => {
  it("страницы склеиваются по id: повтор границы — одна строка, новые сверху", () => {
    const shown = [entry("b", 20), entry("a", 10)];
    const merged = mergeEntries(shown, [entry("c", 30), entry("b", 20)]);
    expect(merged.map((e) => e.id)).toEqual(["c", "b", "a"]);
  });

  it("ошибка — отказ сервера, спорное со скана, ошибка и брак упаковки", () => {
    expect(isJournalError(entry("a", 1, { flagged: true }))).toBe(true);
    expect(isJournalError(entry("a", 1, { refs: { dispute: "extra" } }))).toBe(true);
    expect(isJournalError(entry("a", 1, { refs: { type: "pack_reject" } }))).toBe(true);
    expect(isJournalError(entry("a", 1, { refs: { type: "pack_scan" } }))).toBe(false);
  });

  it("демо: журнал смен теми же процессами и фильтрами; в счёт — сканы товара", () => {
    const ev = (id: string, type: StaffEvent["type"], at: number, staffId = "s1"): StaffEvent => ({
      id,
      staffId,
      type,
      at,
    });
    const events = [
      ev("1", "shift_start", 1),
      ev("2", "pick_scan", 2),
      ev("3", "pack_scan", 3),
      ev("4", "pack_label", 4),
      ev("5", "pack_error", 5, "s2"),
    ];
    const all = localJournal(events, {});
    expect(all.map((e) => [e.id, e.step, e.counted])).toEqual([
      ["5", "pack", false],
      ["4", "label", false],
      ["3", "pack", true],
      ["2", "pick", true],
      ["1", "shift", false],
    ]);
    expect(localJournal(events, { steps: ["pick"] }).map((e) => e.id)).toEqual(["2"]);
    expect(localJournal(events, { staff: "s2" }).map((e) => e.id)).toEqual(["5"]);
    expect(localJournal(events, { errors: true }).map((e) => e.id)).toEqual(["5"]);
    expect(localJournal(events, { before: 3 }).map((e) => e.id)).toEqual(["3", "2", "1"]);
  });

  it("адрес запроса — только заданные фильтры и склад", () => {
    expect(journalQuery("wh_a", {})).toBe("warehouse=wh_a");
    expect(journalQuery("wh_a", { steps: ["pick", "pack"], errors: true, staff: "s1" }, 99)).toBe(
      "warehouse=wh_a&steps=pick%2Cpack&staff=s1&errors=1&before=99",
    );
  });

  it("экран открывает «Персонал: смотреть», кладовщику он закрыт", () => {
    expect(viewAllowed("journal", ["staff.view"])).toBe(true);
    expect(viewAllowed("journal", ["staff.manage"])).toBe(true);
    expect(viewAllowed("journal", ["stock.view", "picking.do"])).toBe(false);
  });
});
