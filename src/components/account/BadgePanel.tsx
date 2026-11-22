import { useState } from "react";
import { BadgeCheck, IdCard, Printer, X } from "lucide-react";
import type { StaffMember } from "@/lib/types";
import { badgeRepository } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import type { TFunc } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { DialogHeader, DialogShell } from "@/components/ui/dialog-shell";
import { QrSvg } from "@/components/table/QrSvg";
import { FieldError } from "@/components/ui/field";

/**
 * Бейдж сотрудника — боковой панелью справа, а не окном поверх (правило
 * кабинета). На сервере код случайный и показывается один раз, а выпуск
 * нового гасит прежний. Поэтому открытие панели бейдж не выпускает: раньше
 * каждое нажатие на значок молча гасило уже напечатанный бейдж, и человека
 * не пускало за стол (разбор staging, 22.11). Выпуск — отдельной кнопкой с
 * предупреждением. В демо код вечный — показываем сразу.
 * На бумагу уходит только сам бейдж (`.print-root`).
 */
export function BadgePanel({
  member,
  onClose,
  t,
}: {
  member: StaffMember;
  onClose: () => void;
  t: TFunc;
}) {
  const revocable = badgeRepository.revocable();
  const [code, setCode] = useState<string | null>(() => badgeRepository.shown(member.id));
  const issue = useCommand(() => badgeRepository.issue(member.id));
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
        ) : code === null ? (
          <>
            <p className="text-sm">{t("staff.badge.intro")}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={issue.pending}
                onClick={async () => {
                  const res = await issue.run();
                  if (res.ok) setCode(res.data);
                }}
              >
                <IdCard />
                {t(issue.error ? "data.retry" : "staff.badge.issue")}
              </Button>
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
            </div>
            {issue.error && <FieldError>{t(issue.error)}</FieldError>}
            {revoke.error && <FieldError>{t(revoke.error)}</FieldError>}
          </>
        ) : (
          <>
            {/* Сам бейдж: то, что уйдёт на бумагу. */}
            <div className="print-root flex flex-col items-center gap-3 py-2 text-center">
              <div className="bg-white p-2 text-black">
                <QrSvg code={code} size={200} showCode={false} />
              </div>
              {/* Номер бейджа — то же, что в QR (Кирилл 14.11): сканер не
                  прочитал — код вводят руками. */}
              <p className="max-w-full break-all font-mono text-lg font-semibold leading-tight">
                {code}
              </p>
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
            {revoke.error && <FieldError>{t(revoke.error)}</FieldError>}
          </>
        )}
      </div>
    </DialogShell>
  );
}
