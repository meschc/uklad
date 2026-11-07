import type { StateStorage } from "zustand/middleware";
import { packText, unpackText } from "../storeCodec";
import { readLocal, removeLocal } from "../safeStorage";
import { journal } from "../support/journal";

/**
 * Хранилище сохранения кабинета: сжатое (`storeCodec.ts`) и не чаще раза в
 * секунду. Стор зовёт запись на каждую правку — при скане раз в полсекунды
 * это была бы полная перепаковка истории склада на каждый скан. Последняя
 * правка дописывается при уходе со страницы (`pagehide`, скрытая вкладка).
 * Сервер копию не ждёт: правки уходят туда сами (`serverSync.ts`).
 *
 * Всё, что пишет или стирает сохранение мимо стора (восстановление копии,
 * замена копии сервером, выход), идёт через `writeSaved`/`removeSaved`: они
 * отменяют отложенную запись стора, иначе та легла бы поверх перед
 * перезагрузкой.
 */

export const PERSIST_KEY = "uklad-store-v1";
const WRITE_EVERY_MS = 1000;

let pending: { key: string; value: string } | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
/** Сохранение заменено мимо стора — до перезагрузки стор его не пишет. */
let frozen = false;

function writeNow() {
  clearTimeout(timer);
  timer = undefined;
  const job = pending;
  pending = null;
  if (!job || frozen) return;
  try {
    localStorage.setItem(job.key, packText(job.value));
  } catch (err) {
    // Хранилище переполнено или запрещено: работа не теряется — она на
    // сервере, но копия на устройстве отстала. Это видно в консоли.
    console.warn("[uklad] сохранение кабинета на устройстве не записалось", err);
    journal.record("error", "persist:write", String(err));
  }
}

/**
 * Битое сохранение для стора — как первый запуск: демо-сборка посеяла бы
 * демо-данные и первой же записью стёрла бы битое навсегда. Поэтому сырую
 * строку сначала откладываем рядом (`<ключ>.broken`) — разобрать её можно
 * потом, — и пишем в журнал поддержки.
 */
function readKeepingBroken(key: string): string | null {
  const raw = readLocal(key);
  const text = unpackText(raw);
  if (raw !== null && text === null) {
    journal.record("error", "persist:broken", key);
    try {
      localStorage.setItem(`${key}.broken`, raw);
    } catch {
      // не влезло — остаётся запись в журнале
    }
  }
  return text;
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", writeNow);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") writeNow();
  });
}

export const persistStorage: StateStorage = {
  getItem: (key) => readKeepingBroken(key),
  setItem: (key, value) => {
    if (frozen) return;
    pending = { key, value };
    timer ??= setTimeout(writeNow, WRITE_EVERY_MS);
  },
  removeItem: (key) => {
    if (pending?.key === key) pending = null;
    removeLocal(key);
  },
};

/** Прочитать сохранение (или отложенную копию) — сжатое или старое. */
export function readSaved(key: string): string | null {
  return readKeepingBroken(key);
}

/**
 * Записать сохранение мимо стора. Бросает при сбое хранилища: восстановление,
 * которое не записалось, — несостоявшееся, и человек должен об этом узнать.
 */
export function writeSaved(key: string, text: string): void {
  localStorage.setItem(key, packText(text));
  // Замораживаем только после записи: несостоявшееся восстановление не
  // должно оставить стор без записи до перезагрузки.
  if (key === PERSIST_KEY) {
    pending = null;
    frozen = true;
  }
}

/** Стереть сохранение мимо стора: отложенная запись стора его не вернёт. */
export function removeSaved(key: string): void {
  if (key === PERSIST_KEY) {
    pending = null;
    frozen = true;
  }
  removeLocal(key);
}

/** Для тестов: дописать отложенное сразу и снять заморозку. */
export function flushSavedForTests(): void {
  writeNow();
  frozen = false;
}
