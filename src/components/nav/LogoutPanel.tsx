import { LogOut } from "lucide-react";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { DialogFooter, DialogHeader, DialogShell } from "@/components/ui/dialog-shell";
import { LogoutConfirm } from "@/components/account/LogoutConfirm";

/**
 * «Выйти» из меню, когда не всё записано на сервере: та же строка, что в
 * «Настройках», панелью справа, и подтверждение выхода.
 */
export function LogoutPanel({
  deferred,
  onCancel,
  onConfirm,
}: {
  deferred: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  return (
    <DialogShell size="sm" onClose={onCancel}>
      <DialogHeader>
        <h2 className="text-sm font-semibold">{t("profile.logout")}</h2>
      </DialogHeader>
      <div className="px-5 py-4">
        <LogoutConfirm deferred={deferred} onCancel={onCancel} />
      </div>
      <DialogFooter>
        <Button size="sm" variant="destructive" onClick={onConfirm}>
          <LogOut className="size-4" />
          {t("profile.logoutConfirm")}
        </Button>
      </DialogFooter>
    </DialogShell>
  );
}
