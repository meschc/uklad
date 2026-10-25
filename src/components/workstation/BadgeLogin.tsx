import { useState } from "react";
import { BadgeCheck } from "lucide-react";
import { useEditor } from "@/lib/store";
import { workstationRepository } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import { MANAGER_ROLE, badgeCode } from "@/lib/workstation";
import { useT } from "@/lib/i18n";
import { card } from "@/components/ui/card";
import { eyebrow } from "@/components/ui/eyebrow";
import { QrSvg } from "@/components/table/QrSvg";
import { ScanField, type ScanStatus } from "@/components/fulfillment/ScanField";

/**
 * Вход по бейджу. Сканер «печатает» код в поле — тот же путь, что на приёмке.
 * Ниже — бейджи персонала для демо: без сканера под рукой клик по бейджу
 * делает ровно то же, что скан, а заодно показывает, что печатать на бейдже.
 *
 * Демо-бейджи — вход за любого сотрудника одним кликом. В рабочем кабинете с
 * сервером их быть не должно: показывать только в демо-режиме.
 */
export function BadgeLogin() {
  const t = useT();
  const allStaff = useEditor((s) => s.warehouse.staff) ?? [];
  // Руководство в процессах не работает — его бейджей среди демо нет. Войти
  // по скану оно может (подменить упаковщика), просто не из подсказки.
  const staff = allStaff.filter((m) => !MANAGER_ROLE.test(m.role));
  const login = useCommand(workstationRepository.login);
  const [status, setStatus] = useState<ScanStatus>("idle");

  const submit = async (code: string) => {
    const res = await login.run(code, "pack");
    setStatus(res.ok ? "ok" : "error");
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <BadgeCheck className="size-6" />
        </span>
        <h1 className="text-xl font-semibold tracking-tight">{t("ws.login.title")}</h1>
        <p className="max-w-md text-sm text-muted-foreground">{t("ws.login.body")}</p>
      </div>

      <ScanField
        label={t("ws.login.scan")}
        status={status}
        placeholder="UK-STF-…"
        hint={login.error ? t(login.error) : undefined}
        actionLabel={t("ws.act.login")}
        onSubmit={(code) => void submit(code)}
      />

      <section className="flex flex-col gap-2">
        <h2 className={eyebrow({ tone: "muted" })}>{t("ws.login.demo")}</h2>
        <p className="text-xs text-muted-foreground">{t("ws.login.demoHint")}</p>
        {staff.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("ws.login.noStaff")}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {staff.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className={card({
                    pad: "sm",
                    className:
                      "flex h-full w-full cursor-pointer flex-col items-center gap-2 text-center transition-colors hover:border-primary",
                  })}
                  onClick={() => void submit(badgeCode(m.id))}
                >
                  <QrSvg code={badgeCode(m.id)} size={72} showCode={false} />
                  <span className="text-sm font-medium leading-tight">{m.name}</span>
                  <span className="text-xs text-muted-foreground">{m.role}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
