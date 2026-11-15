import { useSyncExternalStore } from "react";
import { readLocal, writeLocal } from "./safeStorage";

/**
 * Тихая печать этикеток со стола упаковки.
 *
 * Браузер не умеет печатать без окна сам и не говорит странице, есть ли окно.
 * Выход без установки программ — Chrome (или Edge, он на том же движке),
 * запущенный с флагом `--kiosk-printing`: `window.print()` тогда сразу уходит
 * на принтер, выбранный в этом профиле браузера. Флаг ставим не на весь
 * браузер, а на отдельный профиль-ярлык «Уклад — упаковка»: иначе тихо
 * печатались бы и документы А4 из обычного Chrome.
 *
 * Есть ли окно, узнаём по времени: пока системное окно печати открыто,
 * `window.print()` держит страницу, а тихая печать возвращается сразу —
 * человек так быстро окно закрыть не успевает.
 */

export type PrintMode = "silent" | "dialog";

/**
 * Дольше этого — значит, держало окно печати. Замер в Chromium с тихой
 * печатью на виртуальном принтере: 550–850 мс (первая печать дольше).
 * Человеку на окно — выбрать, нажать — нужно заметно больше двух секунд.
 */
export const SILENT_PRINT_MAX_MS = 2000;

export function classifyPrint(ms: number): PrintMode {
  return ms <= SILENT_PRINT_MAX_MS ? "silent" : "dialog";
}

const KEY = "uklad-print-mode-v1";
const listeners = new Set<() => void>();
let cached: PrintMode | null | undefined;

function readMode(): PrintMode | null {
  if (cached === undefined) {
    const raw = readLocal(KEY);
    cached = raw === "silent" || raw === "dialog" ? raw : null;
  }
  return cached;
}

function saveMode(mode: PrintMode) {
  if (cached === mode) return;
  cached = mode;
  writeLocal(KEY, mode);
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Как печатал этот браузер в последний раз; `null` — ещё не печатал. */
export function usePrintMode(): PrintMode | null {
  return useSyncExternalStore(subscribe, readMode, () => null);
}

/**
 * Напечатать то, что сейчас в печатном блоке, и запомнить, было ли окно.
 * Кадр ожидания — чтобы только что появившаяся этикетка успела отрисоваться.
 */
export function printNow(onPrinted?: () => void): void {
  requestAnimationFrame(() => {
    const started = performance.now();
    window.print();
    saveMode(classifyPrint(performance.now() - started));
    onPrinted?.();
  });
}

// Этикетки, уже отправленные на печать. Экран упаковки монтируется заново
// (панель, «последний товар», перезагрузка страницы), а лента не должна выйти
// дважды без ведома человека: список переживает перезагрузку, хранится
// последние PRINTED_KEEP кодов.
const PRINTED_KEY = "uklad-printed-labels-v1";
const PRINTED_KEEP = 200;
let printed: string[] | null = null;

function printedList(): string[] {
  if (!printed) {
    try {
      const v: unknown = JSON.parse(readLocal(PRINTED_KEY) ?? "[]");
      printed = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    } catch {
      printed = [];
    }
  }
  return printed;
}

const autoPrinted = {
  has: (code: string) => printedList().includes(code),
  add: (code: string) => {
    if (autoPrinted.has(code)) return;
    printed = [...printedList(), code].slice(-PRINTED_KEEP);
    writeLocal(PRINTED_KEY, JSON.stringify(printed));
  },
};

/** Сама печать после скана — один раз на код за время работы страницы. */
export function autoPrintOnce(code: string): boolean {
  if (!code || autoPrinted.has(code)) return false;
  autoPrinted.add(code);
  printNow();
  return true;
}

/**
 * Печать по кнопке. `true` — эту этикетку уже печатали, значит, это
 * перепечатка и её пишут в журнал стола.
 */
export function printByHand(code: string): boolean {
  const again = autoPrinted.has(code);
  autoPrinted.add(code);
  printNow();
  return again;
}

/** Только для тестов. */
export function resetSilentPrint() {
  printed = [];
  cached = undefined;
}

/** Адрес кабинета, который откроет ярлык: тот же сервер, что сейчас. */
export function deskUrl(origin: string, base: string): string {
  return new URL(base || "/", origin).href;
}

const SHORTCUT_NAME = "Уклад — упаковка";

/**
 * Файл для Windows: находит Chrome или Edge, кладёт на рабочий стол ярлык
 * с тихой печатью и отдельным профилем и открывает этот профиль без неё. `chcp 65001` —
 * до первой русской строки, иначе имя ярлыка превратится в кракозябры.
 * Переводы строк CRLF: так `cmd` читает файл без сюрпризов.
 */
export function windowsShortcutScript(url: string): string {
  const browsers = [
    "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe",
    "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe",
    "%LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe",
    "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe",
    "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe",
  ]
    .map((p) => `"${p}"`)
    .join(" ");
  const ps = [
    "$s=(New-Object -ComObject WScript.Shell).CreateShortcut(",
    `[Environment]::GetFolderPath('Desktop')+'\\${SHORTCUT_NAME}.lnk');`,
    "$s.TargetPath=$env:UK_BROWSER;",
    `$s.Arguments='--user-data-dir=\\"'+$env:UK_PROFILE+'\\" --kiosk-printing --app='+$env:UK_URL;`,
    "$s.Save()",
  ].join(" ");
  return [
    "@echo off",
    "chcp 65001 >nul",
    "setlocal",
    `set "UK_URL=${url}"`,
    'set "UK_PROFILE=%LOCALAPPDATA%\\Uklad\\Desk"',
    'set "UK_BROWSER="',
    `for %%P in (${browsers}) do if not defined UK_BROWSER if exist %%P set "UK_BROWSER=%%~P"`,
    "if not defined UK_BROWSER (",
    "  echo Не нашли Chrome или Edge. Установите Google Chrome и запустите этот файл снова.",
    "  pause",
    "  exit /b 1",
    ")",
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "${ps}"`,
    `echo Готово: на рабочем столе ярлык «${SHORTCUT_NAME}». Сейчас выберите принтер.`,
    // Первый запуск — без тихой печати: в окне печати выбирают принтер
    // этикеток, профиль его запомнит, и ярлык потом печатает туда без окна.
    'start "" "%UK_BROWSER%" --user-data-dir="%UK_PROFILE%" --app=%UK_URL%',
    "",
  ].join("\r\n");
}

/**
 * Команда для Терминала на Mac: тот же отдельный профиль. Без тихой печати —
 * чтобы один раз выбрать принтер, с ней — для работы.
 */
export function macCommand(url: string, silent: boolean): string {
  const flag = silent ? " --kiosk-printing" : "";
  return `open -na "Google Chrome" --args --user-data-dir="$HOME/Library/Application Support/Uklad Desk"${flag} --app=${url}`;
}

/** Отдать файл ярлыка браузеру на скачивание. */
export function downloadWindowsShortcut(url: string): void {
  const blob = new Blob([windowsShortcutScript(url)], { type: "application/x-bat" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = "uklad-upakovka.bat";
  a.click();
  URL.revokeObjectURL(href);
}
