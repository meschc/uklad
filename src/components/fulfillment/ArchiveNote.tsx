import { useT } from "@/lib/i18n";
import { ensureArchive, useArchiveStatus } from "@/lib/store/archive";
import { Button } from "@/components/ui/button";

/**
 * Строка над отчётом, пока он считает не всю историю: архив старше 45 дней
 * ещё едет с сервера или не доехал (`store/archive.ts`). Когда всё на месте
 * (и в демо, где архива нет), её нет вовсе.
 */
export function ArchiveNote() {
  const t = useT();
  const status = useArchiveStatus();
  if (status === "loading") {
    return (
      <p role="status" className="text-xs text-muted-foreground">
        {t("archive.loading")}
      </p>
    );
  }
  if (status !== "failed") return null;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 text-xs">
      <span>{t("archive.failed")}</span>
      <Button size="sm" variant="outline" onClick={() => void ensureArchive()}>
        {t("archive.retry")}
      </Button>
    </div>
  );
}
