import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { downloadBackup, downloadDeferredCopy } from "./backupDownload";

/** Строка «не всё записано на сервере» перед выходом (`useLogout`). */
export function LogoutConfirm({ deferred, onCancel }: { deferred: boolean; onCancel: () => void }) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="mr-auto">
        {t(deferred ? "profile.logoutDeferred" : "profile.logoutUnsynced")}
      </span>
      {deferred && (
        <Button size="sm" variant="outline" onClick={downloadDeferredCopy}>
          {t("profile.logoutDeferredBackup")}
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={() => void downloadBackup()}>
        {t("profile.logoutBackup")}
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>
        {t("login.switch.cancel")}
      </Button>
    </div>
  );
}
