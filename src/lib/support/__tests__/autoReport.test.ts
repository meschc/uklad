import { describe, expect, it, vi } from "vitest";
import {
  buildClientError,
  createAutoReporter,
  MAX_PER_PAGE,
  type ClientError,
} from "../autoReport";

describe("buildClientError", () => {
  it("берёт первую строку и верх стека, контакты стирает", () => {
    const e = new TypeError("нет ivan@mail.ru в списке\nподробности");
    const body = buildClientError("screen:inventory", "inventory", e)!;
    expect(body.message).toBe("TypeError: нет [почта] в списке");
    expect(body.source).toBe("screen:inventory");
    expect(body.view).toBe("inventory");
    expect(body.stack?.split("\n").length).toBeLessThanOrEqual(8);
    expect(JSON.stringify(body)).not.toContain("ivan@");
  });

  it("шум браузера не шлёт, странный экран не передаёт", () => {
    expect(buildClientError("window", "plan", "ResizeObserver loop limit exceeded")).toBeNull();
    expect(buildClientError("window", "plan", "Script error.")).toBeNull();
    expect(buildClientError("promise", "../x", "сбой")!.view).toBe("");
  });
});

describe("createAutoReporter", () => {
  it("одна ошибка — один раз, всего не больше предела за загрузку", () => {
    const sent: ClientError[] = [];
    const report = createAutoReporter((b) => void sent.push(b));
    report("window", "plan", new Error("a"));
    report("window", "plan", new Error("a"));
    expect(sent).toHaveLength(1);
    for (let i = 0; i < 30; i++) report("window", "plan", new Error(`b${i}`));
    expect(sent).toHaveLength(MAX_PER_PAGE);
  });

  it("без сервера не шлёт, сбой отправки наружу не выходит", () => {
    expect(() => createAutoReporter(null)("window", "plan", new Error("a"))).not.toThrow();
    const send = vi.fn(() => {
      throw new Error("сеть");
    });
    expect(() => createAutoReporter(send)("window", "plan", new Error("a"))).not.toThrow();
    expect(send).toHaveBeenCalledOnce();
  });
});
