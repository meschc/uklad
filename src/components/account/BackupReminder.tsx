import { useState } from "react";
import { DatabaseBackup } from "lucide-react";
import { useEditor } from "@/lib/store";
import { isBackupDue, SNOOZE_MS } from "@/lib/tariff";
import { useCommand } from "@/lib/useCommand";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { card } from "@/components/ui/card";
import { downloadBackup } from "./backupDownload";

/**
 * Напоминание сделать копию — в кабинете, куда человек заходит первым делом.
 * Срок выбирается в профиле; «Напомнить завтра» откладывает, но не отменяет.
 */
export function BackupReminder() {
  const t = useT();
  const backup = useEditor((s) => s.subscription.backup);
  const update = useEditor((s) => s.updateBackupSettings);
  const download = useCommand(downloadBackup);
  // Время берём один раз на показ: рендер должен быть чистым, а точность до
  // минуты напоминанию не нужна.
  const [now] = useState(() => Date.now());

  if (!isBackupDue(backup, now)) return null;

  const body = backup.lastBackupAt
    ? t("backup.due.ago", {
        date: new Date(backup.lastBackupAt).toLocaleDateString(t.lang, {
          day: "numeric",
          month: "long",
        }),
      })
    : t("backup.due.never");

  return (
    <section
      role="status"
      className={card({ className: "flex flex-wrap items-center justify-between gap-3" })}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <DatabaseBackup className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t("backup.due.title")}</p>
          <p className="text-xs text-muted-foreground">{body}</p>
          {download.error && <p className="text-xs text-destructive">{t(download.error)}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => update({ snoozedUntil: now + SNOOZE_MS })}>
          {t("backup.due.later")}
        </Button>
        <Button size="sm" disabled={download.pending} onClick={() => download.run()}>
          {t("backup.download")}
        </Button>
      </div>
    </section>
  );
}
