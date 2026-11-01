import { backupRepository } from "@/lib/data";
import type { Result } from "@/lib/data";
import { deferredCopyFile } from "@/lib/store/serverSync";

function save(fileName: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/** Скачать отложенную при расхождении копию — перед выходом, который её сотрёт. */
export function downloadDeferredCopy() {
  const file = deferredCopyFile();
  if (file) save(file.fileName, file.text);
}

/**
 * Собрать архив и отдать его браузеру файлом. Одна функция на профиль и
 * напоминание в кабинете: скачанная копия в обоих местах одинаково сбрасывает
 * срок напоминания.
 */
export async function downloadBackup(): Promise<Result<void>> {
  const res = await backupRepository.exportArchive();
  if (!res.ok) return res;
  save(res.data.fileName, res.data.text);
  return { ok: true, data: undefined };
}
