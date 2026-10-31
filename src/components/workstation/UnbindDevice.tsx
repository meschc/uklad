import { useState } from "react";
import { MonitorX } from "lucide-react";
import { useEditor } from "@/lib/store";
import { workstationRepository } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import { DEMO_BADGES, MANAGER_ROLE, badgeCode } from "@/lib/workstation";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { eyebrow } from "@/components/ui/eyebrow";
import { ScanField, type ScanStatus } from "@/components/fulfillment/ScanField";

/**
 * Отвязка стола на самом столе — бейджем руководителя. Упаковщик сам стол
 * отвязать не может: иначе любой одним сканом уводил бы общий экран в кабинет.
 * Вне стола то же делает кнопка «Отключить» на экране «Устройства».
 *
 * Бейджи руководства внизу — только для демо, как и на входе.
 */
export function UnbindDevice({ onDone }: { onDone: () => void }) {
  const t = useT();
  const managers = (useEditor((s) => s.warehouse.staff) ?? []).filter((m) =>
    MANAGER_ROLE.test(m.role),
  );
  const unbind = useCommand(workstationRepository.unbindDevice);
  const [status, setStatus] = useState<ScanStatus>("idle");

  const submit = async (code: string) => {
    const res = await unbind.run(code);
    setStatus(res.ok ? "ok" : "error");
    if (res.ok) onDone();
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted">
          <MonitorX className="size-6" />
        </span>
        <h1 className="text-xl font-semibold tracking-tight">{t("ws.kiosk.unbind")}</h1>
        <p className="max-w-md text-sm text-muted-foreground">{t("ws.kiosk.unbindHint")}</p>
      </div>

      <ScanField
        label={t("ws.login.scan")}
        status={status}
        placeholder="UK-STF-…"
        hint={unbind.error ? t(unbind.error) : undefined}
        actionLabel={t("ws.kiosk.unbind")}
        onSubmit={(code) => void submit(code)}
      />

      {DEMO_BADGES && managers.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className={eyebrow({ tone: "muted" })}>{t("ws.login.demo")}</h2>
          <div className="flex flex-wrap gap-2">
            {managers.map((m) => (
              <Button
                key={m.id}
                variant="outline"
                size="sm"
                onClick={() => void submit(badgeCode(m.id))}
              >
                {m.name}
              </Button>
            ))}
          </div>
        </section>
      )}

      <Button variant="ghost" className="self-center" onClick={onDone}>
        {t("ws.kiosk.cancel")}
      </Button>
    </div>
  );
}
