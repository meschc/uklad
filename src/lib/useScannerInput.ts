import { useEffect, useRef } from "react";

/**
 * Приём кода с HID-сканера (USB/Bluetooth «пистолет»).
 *
 * Такой сканер не библиотека и не камера — он просто ОЧЕНЬ быстро «печатает»
 * символы кода и жмёт Enter. Отличаем его от человека по интервалу между
 * нажатиями: люди не набирают осмысленную строку со скоростью 20+ символов в
 * секунду. Поэтому хук слушает keydown на документе и собирает буфер, который
 * отдаёт целиком по Enter (или по паузе, если сканер настроен без суффикса).
 *
 * Что он НЕ должен ломать:
 *  — обычный ручной ввод: пока фокус в текстовом поле, буфер копится, но
 *    отдаётся только если весь ввод пришёл «по-сканерному» быстро;
 *  — клавиатурную навигацию и скринридеры: событие не отменяется и не
 *    останавливается, кроме случая, когда мы действительно распознали скан;
 *  — горячие клавиши: нажатия с Ctrl/Cmd/Alt игнорируются целиком.
 */

/** Максимальный интервал между символами, при котором ввод считаем сканом, мс. */
const SCAN_CHAR_GAP_MS = 50;
/** Пауза, после которой недобранный буфер отдаётся сам (сканер без Enter), мс. */
const SCAN_IDLE_MS = 120;
/** Короче этого скан не бывает — так отсекаем случайное «ab» из горячих клавиш. */
const SCAN_MIN_LENGTH = 4;
/** Защита от мусора: сверхдлинные «коды» не принимаем (см. security-заметку в п.3). */
const SCAN_MAX_LENGTH = 256;

export interface ScannerOptions {
  /** Готовая строка кода. Вызывается уже после отсечения нечеловеческой скорости. */
  onScan: (code: string) => void;
  /** Выключить слушатель, не размонтируя экран (напр. открыт модальный диалог). */
  enabled?: boolean;
  /**
   * Минимальная длина кода. Ярлыки ячеек короткие («2-19-20-3»), поэтому
   * экран сканирования места может опустить порог.
   */
  minLength?: number;
}

/** Считаем ли поле «обычным ручным вводом», куда сканер стрелять не обязан. */
function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  // Скрытое поле-ловушка сканера — это не ручной ввод.
  return !el.dataset.scannerTarget;
}

export function useScannerInput({
  onScan,
  enabled = true,
  minLength = SCAN_MIN_LENGTH,
}: ScannerOptions) {
  // Колбэк держим в ref: иначе каждый ререндер экрана переподписывал бы
  // глобальный слушатель и терял буфер на середине скана.
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    let buffer = "";
    let lastAt = 0;
    let idleTimer: number | undefined;

    const reset = () => {
      buffer = "";
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = undefined;
    };

    const flush = () => {
      const code = buffer.trim();
      reset();
      if (code.length >= minLength && code.length <= SCAN_MAX_LENGTH) {
        onScanRef.current(code);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Горячие клавиши и композиция IME — не наше дело.
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) {
        reset();
        return;
      }

      const now = performance.now();
      const gap = now - lastAt;
      lastAt = now;

      if (e.key === "Enter") {
        // Enter завершает скан, только если перед ним был «сканерный» поток.
        // Пустой буфер — обычный Enter в форме, его не трогаем.
        if (buffer.length >= minLength) {
          const typing = isTypingTarget(e.target);
          // В обычном поле не даём Enter'у заодно отправить форму: код уже
          // распознан как скан, а не как окончание ручного ввода.
          if (!typing) e.preventDefault();
          flush();
        } else {
          reset();
        }
        return;
      }

      // Печатаемый символ — ровно один код-поинт.
      if (e.key.length !== 1) {
        if (e.key === "Escape" || e.key === "Tab") reset();
        return;
      }

      // Пауза больше сканерной — это человек начал набирать заново.
      if (gap > SCAN_CHAR_GAP_MS) buffer = "";
      buffer += e.key;
      if (buffer.length > SCAN_MAX_LENGTH) {
        reset();
        return;
      }

      // Сканер без суффикса Enter: добираем по тишине.
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = window.setTimeout(flush, SCAN_IDLE_MS);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      reset();
    };
  }, [enabled, minLength]);
}
