import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SILENT_PRINT_MAX_MS,
  autoPrintOnce,
  classifyPrint,
  deskUrl,
  macCommand,
  printByHand,
  resetSilentPrint,
  windowsShortcutScript,
} from "../silentPrint";

describe("тихая печать", () => {
  it("быстрый возврат из печати — без окна, долгий — окно держало страницу", () => {
    expect(classifyPrint(80)).toBe("silent");
    expect(classifyPrint(850)).toBe("silent");
    expect(classifyPrint(SILENT_PRINT_MAX_MS)).toBe("silent");
    expect(classifyPrint(SILENT_PRINT_MAX_MS + 1)).toBe("dialog");
    expect(classifyPrint(4000)).toBe("dialog");
  });

  it("адрес ярлыка — тот же сервер и путь кабинета", () => {
    expect(deskUrl("https://u-klad.ru", "/app/")).toBe("https://u-klad.ru/app/");
    expect(deskUrl("http://localhost:5174", "")).toBe("http://localhost:5174/");
  });

  it("файл Windows: свой профиль, ярлык с тихой печатью, первый запуск без неё", () => {
    const bat = windowsShortcutScript("https://u-klad.ru/app/");
    const lines = bat.split("\r\n");
    expect(lines[0]).toBe("@echo off");
    // Кодовая страница — до первой русской строки.
    expect(lines[1]).toBe("chcp 65001 >nul");
    expect(bat).toContain('set "UK_URL=https://u-klad.ru/app/"');
    expect(bat).toContain("chrome.exe");
    expect(bat).toContain("msedge.exe");
    expect(bat).toMatch(/Arguments=.*--kiosk-printing/);
    expect(bat).toMatch(/Arguments=.*--start-fullscreen/);
    const start = lines.find((l) => l.startsWith("start "));
    expect(start).toContain("--user-data-dir=");
    expect(start).not.toContain("--kiosk-printing");
    expect(bat).not.toMatch(/[^\r]\n/);
  });

  it("команды Mac: выбрать принтер без флага, работать с ним", () => {
    expect(macCommand("https://u-klad.ru/app/", false)).not.toContain("--kiosk-printing");
    expect(macCommand("https://u-klad.ru/app/", true)).toContain("--kiosk-printing");
    expect(macCommand("https://u-klad.ru/app/", true)).toContain("--start-fullscreen");
    expect(macCommand("https://u-klad.ru/app/", true)).toContain("--app=https://u-klad.ru/app/");
  });

  describe("печать после скана", () => {
    beforeEach(() => {
      resetSilentPrint();
      vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      });
      vi.stubGlobal("window", { print: vi.fn() });
    });
    afterEach(() => vi.unstubAllGlobals());

    it("одна этикетка печатается один раз, даже если экран нарисовали заново", () => {
      expect(autoPrintOnce("UK-L-1")).toBe(true);
      expect(autoPrintOnce("UK-L-1")).toBe(false);
      expect(autoPrintOnce("UK-L-2")).toBe(true);
      expect(autoPrintOnce("")).toBe(false);
      expect(window.print).toHaveBeenCalledTimes(2);
    });

    it("печать по кнопке после автопечати — перепечатка, первая по кнопке — нет", () => {
      autoPrintOnce("UK-L-1");
      expect(printByHand("UK-L-1")).toBe(true);
      expect(printByHand("UK-L-3")).toBe(false);
      expect(printByHand("UK-L-3")).toBe(true);
    });
  });
});
