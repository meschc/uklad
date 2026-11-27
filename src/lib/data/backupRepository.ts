import { backupFileName, makeBackup, parseBackup } from "../backup";
import { PERSIST_KEY, PERSIST_VERSION, persistedState } from "../store";
import { writeSaved } from "../store/persistStorage";
import { featuresOf } from "../tariff";
import { companyPart } from "../store/serverSync";
import type { MsgKey } from "../i18n";
import { apiRequest } from "./api";
import { storePort, type StorePort } from "./repository";
import { attempt, fail, ok, type Result } from "./result";

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
  /**
   * Кабинет с сервером: заменить кабинет компании на сервере архивом
   * (`server/api/src/cabinet/restore.js`). Только владелец и не во время
   * смены; люди, склады и партнёры не удаляются. Копию текущих данных до
   * этого скачивает экран, перезагрузку — тоже экран.
   */
  restoreOnServer: (text: string) => Promise<Result<void>>;
  /** Включить или выключить еженедельную копию на почту. */
  setWeeklyEmail: (on: boolean) => Promise<Result<void>>;
  /** Отправить копию на почту сейчас. Без сервера — честный отказ. */
  sendByEmail: () => Promise<Result<void>>;
}

/** Куда пишется восстановленный архив — подменяется в тестах. */
export interface PersistTarget {
  write: (key: string, value: string) => void;
}

/** Где лежат данные, бывшие до последнего восстановления. */
export const BEFORE_RESTORE_KEY = `${PERSIST_KEY}.before-restore`;

const localTarget: PersistTarget = {
  // Не `writeLocal`: тот молчит при сбое, а здесь отказ записи — это
  // несостоявшееся восстановление, о котором человек должен узнать.
  // Сжатым, как пишет стор (`persistStorage.ts`): отложенная запись стора
  // после этого не ляжет поверх восстановленного.
  write: (key, value) => writeSaved(key, value),
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
      return attempt(() => {
        // Сначала откладываем текущие данные: восстановленный по ошибке чужой
        // или старый архив иначе стёр бы склад безвозвратно. Не вышло отложить —
        // не восстанавливаем вовсе.
        const current = { state: persistedState(port.get()), version: PERSIST_VERSION };
        target.write(BEFORE_RESTORE_KEY, JSON.stringify(current));
        target.write(PERSIST_KEY, JSON.stringify({ state, version }));
      }, "backup.err.write");
    },

    setWeeklyEmail: async (on) => {
      const s = port.get();
      if (on && !featuresOf(s.subscription).weeklyEmailBackup) {
        return fail("backup.err.tariff");
      }
      return attempt(() => s.updateBackupSettings({ emailWeekly: on }));
    },

    restoreOnServer: async (text) => {
      const parsed = parseBackup(text, PERSIST_VERSION);
      if (!parsed.ok) return fail(parsed.error);
      // Миграции старого формата проходит только загрузка браузера, а сервер
      // хранит кабинет в текущем: старый архив сначала открывают без входа.
      if (parsed.file.version !== PERSIST_VERSION) return fail("backup.err.serverOld");
      const data = companyPart(parsed.file.state as Parameters<typeof companyPart>[0]);
      const res = await attempt(
        () => apiRequest("POST", "/cabinet/restore", { format: PERSIST_VERSION, data }),
        "sync.err.network",
      );
      if (!res.ok) return res;
      const { status, body } = res.data;
      return status === 200 ? ok(undefined) : fail(restoreError(status, body.error));
    },

    sendByEmail: async () => fail("backup.err.noServer"),
  };
}

/** Отказ сервера при загрузке копии → ключ словаря. */
function restoreError(status: number, error: unknown): MsgKey {
  if (status === 409 && error === "shift_open") return "backup.err.shiftOpen";
  if (status === 409 && error === "plan_limit") return "plan.err.warehouseLimit";
  if (status === 403) return "backup.err.ownerOnly";
  if (status === 429) return "backup.err.tooOften";
  if (status === 413) return "sync.err.tooBig";
  if (status === 400) return "sync.err.badData";
  return "sync.err.network";
}

export const backupRepository = createBackupRepository();
