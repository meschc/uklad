// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PERSIST_KEY,
  flushSavedForTests,
  persistStorage,
  readSaved,
  removeSaved,
  writeSaved,
} from "../persistStorage";

describe("persistStorage", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    flushSavedForTests();
    localStorage.clear();
    vi.useRealTimers();
  });

  it("пишет сжатым и не чаще раза в секунду — последнюю правку", () => {
    persistStorage.setItem(PERSIST_KEY, '{"n":1}');
    persistStorage.setItem(PERSIST_KEY, '{"n":2}');
    expect(localStorage.getItem(PERSIST_KEY)).toBeNull();
    vi.advanceTimersByTime(1000);
    expect(localStorage.getItem(PERSIST_KEY)?.startsWith("UKZ1|")).toBe(true);
    expect(persistStorage.getItem(PERSIST_KEY)).toBe('{"n":2}');
  });

  it("уход со страницы дописывает отложенное сразу", () => {
    persistStorage.setItem(PERSIST_KEY, '{"n":3}');
    window.dispatchEvent(new Event("pagehide"));
    expect(readSaved(PERSIST_KEY)).toBe('{"n":3}');
  });

  it("запись мимо стора не перетирается отложенной записью стора", () => {
    persistStorage.setItem(PERSIST_KEY, '{"old":true}');
    writeSaved(PERSIST_KEY, '{"restored":true}');
    persistStorage.setItem(PERSIST_KEY, '{"old":true}');
    vi.advanceTimersByTime(5000);
    window.dispatchEvent(new Event("pagehide"));
    expect(readSaved(PERSIST_KEY)).toBe('{"restored":true}');
  });

  it("стёртое при выходе не возвращается отложенной записью", () => {
    persistStorage.setItem(PERSIST_KEY, '{"n":4}');
    removeSaved(PERSIST_KEY);
    vi.advanceTimersByTime(5000);
    window.dispatchEvent(new Event("pagehide"));
    expect(localStorage.getItem(PERSIST_KEY)).toBeNull();
  });

  it("старое несжатое сохранение читается", () => {
    localStorage.setItem(PERSIST_KEY, '{"state":{"a":1}}');
    expect(persistStorage.getItem(PERSIST_KEY)).toBe('{"state":{"a":1}}');
  });

  it("переполненное хранилище не роняет запись стора", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Прототип самого `localStorage`: у Node 26 свой глобальный `Storage`,
    // и шпион на нём jsdom-хранилище не задел бы.
    const proto = Object.getPrototypeOf(localStorage) as Storage;
    const set = vi.spyOn(proto, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    persistStorage.setItem(PERSIST_KEY, '{"n":5}');
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
    expect(warn).toHaveBeenCalled();
    expect(() => writeSaved("k", "v")).toThrow();
    set.mockRestore();
    warn.mockRestore();
  });

  it("неудачное восстановление не морозит запись стора", () => {
    const proto = Object.getPrototypeOf(localStorage) as Storage;
    const set = vi.spyOn(proto, "setItem").mockImplementationOnce(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    persistStorage.setItem(PERSIST_KEY, '{"n":6}');
    expect(() => writeSaved(PERSIST_KEY, '{"restored":true}')).toThrow();
    set.mockRestore();
    vi.advanceTimersByTime(1000);
    expect(readSaved(PERSIST_KEY)).toBe('{"n":6}');
  });

  it("битое сохранение откладывается рядом, а не теряется", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    localStorage.setItem(PERSIST_KEY, "UKZ1|999|xx");
    expect(persistStorage.getItem(PERSIST_KEY)).toBeNull();
    expect(localStorage.getItem(`${PERSIST_KEY}.broken`)).toBe("UKZ1|999|xx");
    vi.restoreAllMocks();
  });
});
