import { useState } from "react";
import { BadgeCheck, Printer, X } from "lucide-react";
import type { StaffMember } from "@/lib/types";
import { badgeRepository } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import type { TFunc } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { DialogHeader, DialogShell } from "@/components/ui/dialog-shell";
import { QrSvg } from "@/components/table/QrSvg";

/**
 * Бейдж сотрудника — боковой панелью справа, а не окном поверх (правило
 * кабинета). Код приходит уже выпущенным: на сервере он случайный и
 * показывается один раз, поэтому печатать его надо сразу. На бумагу уходит
 * только сам бейдж (`.print-root`), панель и таблица остаются на экране.
 */
export function BadgePanel({
  member,
  code,
  onClose,
  t,
}: {
  member: StaffMember;
  code: string;
  onClose: () => void;
  t: TFunc;
}) {
  const revocable = badgeRepository.revocable();
  const revoke = useCommand(() => badgeRepository.revoke(member.id));
  const [revoked, setRevoked] = useState(false);

  return (
    <DialogShell size="md" scroll onClose={onClose}>
      <DialogHeader>
        <h2 className="text-sm font-semibold">{t("staff.badge.title")}</h2>
        <Button variant="ghost" size="icon-sm" aria-label={t("ws.panel.close")} onClick={onClose}>
          <X />
        </Button>
      </DialogHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5">
        {revoked ? (
          <p className="text-sm">{t("staff.badge.revoked")}</p>
        ) : (
          <>
            {/* Сам бейдж: то, что уйдёт на бумагу. */}
            <div className="print-root flex flex-col items-center gap-3 py-2 text-center">
              <div className="bg-white p-2 text-black">
                <QrSvg code={code} size={200} showCode={false} />
              </div>
              <p className="text-xl font-semibold">{member.name}</p>
              {member.role && <p className="text-sm text-muted-foreground">{member.role}</p>}
            </div>
            <p className="text-sm text-muted-foreground">
              {t(revocable ? "staff.badge.once" : "staff.badge.demo")}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => window.print()}>
                <Printer />
                {t("staff.badge.print")}
              </Button>
              {revocable && (
                <Button
                  variant="outline"
                  disabled={revoke.pending}
                  onClick={async () => {
                    const res = await revoke.run();
                    if (res.ok) setRevoked(true);
                  }}
                >
                  <BadgeCheck />
                  {t(revoke.error ? "data.retry" : "staff.badge.revoke")}
                </Button>
              )}
            </div>
            {revoke.error && (
              <p role="alert" className="text-xs text-destructive">
                {t(revoke.error)}
              </p>
            )}
          </>
        )}
      </div>
    </DialogShell>
  );
}
