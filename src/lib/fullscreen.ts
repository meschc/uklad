import { useSyncExternalStore } from "react";

/**
 * Полный экран стола. Браузер включает его только в ответ на действие
 * человека — клик или нажатие клавиши. Сканер бейджа «печатает» код, это
 * нажатия клавиш, поэтому вход по скану тоже открывает полный экран.
 * Отказ браузера (нет права, iframe, старый Safari) молча пропускаем: стол
 * работает и в окне.
 */
export function fullscreenSupported(): boolean {
  return typeof document !== "undefined" && !!document.documentElement.requestFullscreen;
}

export function enterFullscreen(): void {
  if (!fullscreenSupported() || document.fullscreenElement) return;
  void document.documentElement.requestFullscreen().catch(() => undefined);
}

export function toggleFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  else enterFullscreen();
}

const subscribe = (cb: () => void) => {
  document.addEventListener("fullscreenchange", cb);
  return () => document.removeEventListener("fullscreenchange", cb);
};

/** Открыт ли сейчас полный экран — для значка кнопки. */
export function useIsFullscreen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => !!document.fullscreenElement,
    () => false,
  );
}
