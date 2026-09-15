import { beforeEach, describe, expect, test, vi } from "vitest";
import { c } from "../copy";
import type { RoadmapItem } from "../../data/roadmap";
import {
  MAX_VOTES,
  clearVotes,
  isVotable,
  parseVotes,
  readVotes,
  toggleVote,
  votedItems,
} from "../roadmapVotes";

/**
 * Голоса — единственное место витрины, где хранилище браузера влияет на то, что
 * уходит нам письмом. Поэтому проверяется не «работает ли кнопка», а три вещи,
 * из-за которых письмо пришло бы неверным: что читается чужая запись, что
 * предел не вытесняет уже отмеченное и что перечисление идёт в порядке доски.
 */

const KEY = "uklad.roadmap-votes";

function item(over: Partial<RoadmapItem> & Pick<RoadmapItem, "id">): RoadmapItem {
  return {
    title: c("Пункт", "Item"),
    summary: c("Описание", "Summary"),
    status: "planned",
    track: "platform",
    milestone: "launch",
    ...over,
  };
}

beforeEach(() => {
  localStorage.clear();
  clearVotes();
});

describe("parseVotes", () => {
  test("пустая и отсутствующая запись дают пустой список", () => {
    expect(parseVotes(null)).toEqual([]);
    expect(parseVotes("")).toEqual([]);
  });

  test("обломок JSON не роняет разбор", () => {
    expect(parseVotes("{не json")).toEqual([]);
  });

  test("запись не массива отбрасывается целиком", () => {
    expect(parseVotes('{"a":1}')).toEqual([]);
    expect(parseVotes('"database"')).toEqual([]);
  });

  test("не-строки и пустые строки выкидываются, остальное остаётся", () => {
    expect(parseVotes('["database", 7, null, "", "rights"]')).toEqual(["database", "rights"]);
  });

  test("повторы схлопываются", () => {
    expect(parseVotes('["database", "database", "rights"]')).toEqual(["database", "rights"]);
  });

  test("длинная запись обрезается до предела", () => {
    const many = Array.from({ length: MAX_VOTES + 5 }, (_, i) => `item-${i}`);
    expect(parseVotes(JSON.stringify(many))).toHaveLength(MAX_VOTES);
  });
});

describe("readVotes", () => {
  test("читает то, что лежало в хранилище до загрузки страницы", async () => {
    localStorage.setItem(KEY, '["database", "rights"]');
    // Список кэшируется на весь сеанс, поэтому чтение «с нуля» проверяется на
    // свежем модуле: иначе тест увидел бы кэш предыдущего теста, а не запись.
    vi.resetModules();
    const fresh = await import("../roadmapVotes");
    expect(fresh.readVotes()).toEqual(["database", "rights"]);
  });
});

describe("toggleVote", () => {
  test("отмечает в порядке нажатий и снимает повторным нажатием", () => {
    toggleVote("database");
    toggleVote("rights");
    expect(readVotes()).toEqual(["database", "rights"]);

    toggleVote("database");
    expect(readVotes()).toEqual(["rights"]);
  });

  test("отметка переживает перезагрузку: она записана в хранилище", () => {
    toggleVote("database");
    expect(parseVotes(localStorage.getItem(KEY))).toEqual(["database"]);
  });

  test("сверх предела не отмечает и ничего не вытесняет", () => {
    for (let i = 0; i < MAX_VOTES; i += 1) toggleVote(`item-${i}`);
    const before = readVotes();

    toggleVote("ещё один");

    expect(readVotes()).toEqual(before);
    expect(readVotes()).toHaveLength(MAX_VOTES);
    expect(readVotes()).not.toContain("ещё один");
  });

  test("на пределе снять отметку по-прежнему можно", () => {
    for (let i = 0; i < MAX_VOTES; i += 1) toggleVote(`item-${i}`);
    toggleVote("item-0");
    expect(readVotes()).toHaveLength(MAX_VOTES - 1);
  });
});

describe("clearVotes", () => {
  test("снимает всё и вычищает запись", () => {
    toggleVote("database");
    clearVotes();
    expect(readVotes()).toEqual([]);
    expect(parseVotes(localStorage.getItem(KEY))).toEqual([]);
  });
});

describe("isVotable", () => {
  test("за готовое не голосуют — оно уже работает", () => {
    expect(isVotable(item({ id: "market", status: "done" }))).toBe(false);
  });

  test("за начатое, запланированное и идею — голосуют", () => {
    expect(isVotable(item({ id: "domain", status: "progress" }))).toBe(true);
    expect(isVotable(item({ id: "database", status: "planned" }))).toBe(true);
    expect(isVotable(item({ id: "wild", status: "idea" }))).toBe(true);
  });
});

describe("votedItems", () => {
  const items = [item({ id: "a" }), item({ id: "b" }), item({ id: "c" })];

  test("перечисляет в порядке доски, а не нажатий", () => {
    expect(votedItems(items, ["c", "a"]).map((i) => i.id)).toEqual(["a", "c"]);
  });

  test("неизвестные отметки не превращаются в пункты", () => {
    expect(votedItems(items, ["выпилено-в-прошлом-выпуске"])).toEqual([]);
  });

  test("без отметок список пуст", () => {
    expect(votedItems(items, [])).toEqual([]);
  });
});
