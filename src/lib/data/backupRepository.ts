import { backupFileName, makeBackup, parseBackup } from "../backup";
import { PERSIST_KEY, PERSIST_VERSION, persistedState } from "../store";
import { TARIFF_FEATURES } from "../tariff";
import { storePort, type StorePort } from "./repository";
import { attempt, fail, type Result } from "./result";

/**
 * Резервные копии (тарифы на сайте, группа «Данные»). Архив собирается и
 * восстанавливается в браузере; копия на почту — шов под сервер: сегодня
 * сохраняется только согласие на неё, письма начнёт слать сервер, и экраны
 * при этом не изменятся.
 */
export interface BackupRepository {
  /** Собрать архив и отметить копию сделанной. Скачивание — дело экрана. */
  exportArchive: (now?: number) => Promise<Result<{ fileName: string; text: string }>>;
  /**
   * Заменить данные кабинета архивом. Пишет прямо в хранилище персиста —
   * после перезагрузки архив проходит миграции и проверку формы, как обычный
   * запуск. Перезагрузку делает экран.
   */
  restoreArchive: (text: string) => Promise<Result<void>>;
  /** Включить или выключить еженедельную копию на почту. */
  setWeeklyEmail: (on: boolean) => Promise<Result<void>>;
  /** Отправить копию на почту сейчас. Без сервера — честный отказ. */
  sendByEmail: () => Promise<Result<void>>;
}

/** Куда пишется восстановленный архив — подменяется в тестах. */
export interface PersistTarget {
  write: (key: string, value: string) => void;
}

const localTarget: PersistTarget = {
  // Не `writeLocal`: тот молчит при сбое, а здесь отказ записи — это
  // несостоявшееся восстановление, о котором человек должен узнать.
  write: (key, value) => localStorage.setItem(key, value),
};

export function createBackupRepository(
  port: StorePort = storePort,
  target: PersistTarget = localTarget,
): BackupRepository {
  return {
    exportArchive: (now = Date.now()) =>
      attempt(() => {
        const s = port.get();
        const file = makeBackup(persistedState(s), PERSIST_VERSION, now);
        s.markBackupDone(now);
        return { fileName: backupFileName(now), text: JSON.stringify(file) };
      }),

    restoreArchive: async (text) => {
      const parsed = parseBackup(text, PERSIST_VERSION);
      if (!parsed.ok) return fail(parsed.error);
      const { state, version } = parsed.file;
      return attempt(
        () => target.write(PERSIST_KEY, JSON.stringify({ state, version })),
        "backup.err.write",
      );
    },

    setWeeklyEmail: async (on) => {
      const s = port.get();
      if (on && !TARIFF_FEATURES[s.subscription.tariff].weeklyEmailBackup) {
        return fail("backup.err.tariff");
      }
      return attempt(() => s.updateBackupSettings({ emailWeekly: on }));
    },

    sendByEmail: async () => fail("backup.err.noServer"),
  };
}

export const backupRepository = createBackupRepository();
