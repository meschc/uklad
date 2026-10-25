import { backupRepository } from "@/lib/data";
import type { Result } from "@/lib/data";

/**
 * Собрать архив и отдать его браузеру файлом. Одна функция на профиль и
 * напоминание в кабинете: скачанная копия в обоих местах одинаково сбрасывает
 * срок напоминания.
 */
export async function downloadBackup(): Promise<Result<void>> {
  const res = await backupRepository.exportArchive();
  if (!res.ok) return res;
  const blob = new Blob([res.data.text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = res.data.fileName;
  a.click();
  URL.revokeObjectURL(url);
  return { ok: true, data: undefined };
}
