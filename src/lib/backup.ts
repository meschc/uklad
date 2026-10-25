import type { MsgKey } from "./i18n";

/**
 * Резервная копия кабинета: всё, что переживает перезагрузку страницы, одним
 * JSON-файлом. Внутри — ровно то, что `partialize` кладёт в хранилище, и его
 * версия: восстановленный архив проходит те же миграции и ту же проверку формы
 * (`merge` → `sanitizeDomains`), что и обычный запуск. Второго пути загрузки
 * данных, который разъедется с основным, нет.
 */

export const BACKUP_FORMAT = "uklad-backup";

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  /** Версия персиста стора на момент копии. */
  version: number;
  createdAt: string;
  state: Record<string, unknown>;
}

export function makeBackup(
  state: Record<string, unknown>,
  version: number,
  now: number,
): BackupFile {
  return { format: BACKUP_FORMAT, version, createdAt: new Date(now).toISOString(), state };
}

/** Имя файла с датой: копии за разные дни не перезаписывают друг друга. */
export function backupFileName(now: number): string {
  return `uklad-backup-${new Date(now).toISOString().slice(0, 10)}.json`;
}

export type ParsedBackup = { ok: true; file: BackupFile } | { ok: false; error: MsgKey };

/**
 * Разбор файла перед восстановлением. Восстановление стирает текущие данные,
 * поэтому отказываем на любом сомнении: чужой JSON, копия из более новой версии
 * кабинета (её миграции здесь неизвестны), архив без склада.
 */
export function parseBackup(text: string, currentVersion: number): ParsedBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "backup.err.notJson" };
  }
  if (!isObject(raw) || raw.format !== BACKUP_FORMAT) {
    return { ok: false, error: "backup.err.format" };
  }
  if (typeof raw.version !== "number" || raw.version > currentVersion) {
    return { ok: false, error: "backup.err.version" };
  }
  if (!isObject(raw.state) || !isObject(raw.state.warehouse)) {
    return { ok: false, error: "backup.err.empty" };
  }
  return {
    ok: true,
    file: {
      format: BACKUP_FORMAT,
      version: raw.version,
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
      state: raw.state,
    },
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
