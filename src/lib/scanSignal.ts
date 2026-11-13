import { useSyncExternalStore } from "react";
import { beep } from "./beep";

/**
 * Сигнал скана рамкой рабочего места: три уровня, у каждого свой смысл.
 *
 * - зелёный — короткая вспышка: принято, работайте дальше;
 * - жёлтый — держится: «не всё» — комплект не наполнен, не тот порядок
 *   (сначала этикетка), лишняя штука. Исправляется следующим сканом;
 * - красный — держится до верного скана: критично — товара нет в таре,
 *   код чужой, короб не того назначения, повтор на погрузке.
 *
 * Звук идёт вместе с цветом: упаковщик смотрит на товар, а не на экран.
 * Состояние общее для всего стола (модуль, а не контекст): поле скана живёт
 * глубоко в шаге, а рамка — в оболочке рабочего места.
 */
export type SignalLevel = "ok" | "warn" | "error";

/**
 * Ошибки «жёлтого» класса: человек ничего не испортил, нужен следующий шаг.
 * Всё, что не здесь, — красное. Список пополняют вместе с новыми ключами.
 */
const WARN_KEYS = new Set<string>([
  "ws.run.label_pending",
  "ws.run.extra",
  "ws.chk.label_not_item",
  "ws.chk.product_not_label",
  "ws.chk.tote_code",
  "ws.ship.notVehicle",
  "ws.ship.notUnit",
  "pick.item.duplicate",
  "recv.box.picking",
]);

/** Уровень ошибки по ключу сообщения. */
export function levelFor(key: string): Exclude<SignalLevel, "ok"> {
  return WARN_KEYS.has(key) ? "warn" : "error";
}

/** Сколько горит зелёная вспышка. */
const OK_MS = 700;

let flashLevel: SignalLevel | null = null;
let held: "warn" | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Результат скана: звук и рамка. `quiet` — звук уже сыгран (звук назначения). */
export function signal(level: SignalLevel, opts: { quiet?: boolean } = {}): void {
  if (!opts.quiet) beep(level);
  clearTimeout(timer);
  flashLevel = level;
  if (level === "ok") {
    timer = setTimeout(() => {
      flashLevel = null;
      emit();
    }, OK_MS);
  }
  emit();
}

/**
 * Долгий жёлтый, пока дело не доделано (заказ из нескольких штук собран не
 * весь). Горит, когда нет вспышки; `null` — снять.
 */
export function holdSignal(level: "warn" | null): void {
  if (held === level) return;
  held = level;
  emit();
}

/** Сбросить всё: смена шага, выход со стола. */
export function clearSignal(): void {
  clearTimeout(timer);
  flashLevel = null;
  held = null;
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Что сейчас показывает рамка. */
export function useStationSignal(): SignalLevel | null {
  return useSyncExternalStore(
    subscribe,
    () => flashLevel ?? held,
    () => null,
  );
}
