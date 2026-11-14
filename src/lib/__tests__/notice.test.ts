import { describe, expect, it } from "vitest";
import { noticeDuration, pushNotice, type Notice } from "../notice";
import { UNDO_WINDOW_MS } from "../actionRisk";

const base = { tone: "success" as const, key: "chat.copied" as const };

describe("уведомления", () => {
  it("ошибка висит дольше успеха, отмена — ровно окно отмены", () => {
    expect(noticeDuration("success", 20, false)).toBe(4000);
    expect(noticeDuration("error", 20, false)).toBeGreaterThanOrEqual(10_000);
    expect(noticeDuration("warning", 20, false)).toBeGreaterThan(noticeDuration("info", 20, false));
    expect(noticeDuration("error", 20, true)).toBe(UNDO_WINDOW_MS);
  });

  it("длинный текст живёт дольше, но не вечно", () => {
    expect(noticeDuration("success", 120, false)).toBeGreaterThan(4000);
    expect(noticeDuration("success", 10_000, false)).toBe(16_000);
  });

  it("повтор того же не плодит копию, а поднимает счётчик", () => {
    let list: Notice[] = pushNotice([], base, 1);
    list = pushNotice(list, base, 2);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 2, count: 2 });
  });

  it("разные числа и разный тон — разные уведомления", () => {
    let list: Notice[] = pushNotice([], { ...base, vars: { n: 1 } }, 1);
    list = pushNotice(list, { ...base, vars: { n: 2 } }, 2);
    list = pushNotice(list, { ...base, tone: "error", vars: { n: 2 } }, 3);
    expect(list).toHaveLength(3);
  });

  it("отменяемые не склеиваются: у каждого своя отмена", () => {
    const undo = () => {};
    let list: Notice[] = pushNotice([], { ...base, undo }, 1);
    list = pushNotice(list, { ...base, undo }, 2);
    expect(list).toHaveLength(2);
  });

  it("в стопке не больше трёх, уходят старые", () => {
    let list: Notice[] = [];
    for (let i = 1; i <= 5; i++) list = pushNotice(list, { ...base, vars: { n: i } }, i);
    expect(list.map((n) => n.id)).toEqual([3, 4, 5]);
  });
});
