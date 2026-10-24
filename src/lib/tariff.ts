import type { BackupSettings, TariffId } from "./types";

/**
 * Что входит в тариф — только то, чем кабинет отличается по тарифам. Источник
 * обещаний — таблица отличий на сайте (`site/components/warehouses/
 * tariffsData.ts`); если там поменялась галочка, меняется и эта таблица, иначе
 * сайт обещает одно, а кабинет делает другое.
 */
export interface TariffFeatures {
  /** «Аналитика: полная» против «основные показатели» у «Старта». */
  fullAnalytics: boolean;
  personalManager: boolean;
  /** Автоматическая копия каждую неделю на почту. */
  weeklyEmailBackup: boolean;
}

export const TARIFF_FEATURES: Record<TariffId, TariffFeatures> = {
  operator: { fullAnalytics: true, personalManager: true, weeklyEmailBackup: true },
  warehouse: { fullAnalytics: true, personalManager: false, weeklyEmailBackup: true },
  start: { fullAnalytics: false, personalManager: false, weeklyEmailBackup: false },
};

export const TARIFF_IDS: TariffId[] = ["operator", "warehouse", "start"];

/** Самый младший тариф, в котором функция есть, — для подписи «доступно в …». */
export function cheapestWith(feature: keyof TariffFeatures): TariffId {
  return [...TARIFF_IDS].reverse().find((id) => TARIFF_FEATURES[id][feature]) ?? "operator";
}

/** Сроки напоминания, из которых выбирает человек (0 — не напоминать). */
export const REMIND_OPTIONS = [0, 7, 14, 30] as const;

const DAY = 24 * 60 * 60 * 1000;

/**
 * Пора ли напомнить о копии. Копии ещё не было — пора сразу: потерять данные,
 * которые ни разу не сохранялись, обиднее всего. «Напомнить позже» сдвигает
 * срок, но не отменяет его.
 */
export function isBackupDue(b: BackupSettings, now: number): boolean {
  if (b.remindEveryDays <= 0) return false;
  if (b.snoozedUntil && now < b.snoozedUntil) return false;
  if (b.lastBackupAt == null) return true;
  return now - b.lastBackupAt >= b.remindEveryDays * DAY;
}

/** Через сколько суток «Напомнить позже». */
export const SNOOZE_MS = DAY;
