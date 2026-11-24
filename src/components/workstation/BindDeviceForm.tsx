import { useState } from "react";
import { MonitorSmartphone } from "lucide-react";
import { workstationRepository, type BindConfirm } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import type { WorkstationKind } from "@/lib/types";
import { useT, type MsgKey } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";
import { FormError } from "@/components/ui/field";
import { useEditor } from "@/lib/store";
import { OPEN_STATIONS } from "@/lib/stationSwitch";
import { PasswordSwitch } from "./PasswordSwitch";

/**
 * Привязать этот компьютер как стол склада. Одна форма на двух экранах:
 * «Устройства» в кабинете и само рабочее место — привязывают, сидя за тем
 * компьютером, поэтому первый раз это удобнее сделать прямо на столе.
 *
 * Привязывает руководитель здесь и сейчас (миграция 052): вошёл паролем
 * только что — сразу; вход давний — сервер просит его бейдж или пароль, и
 * форма показывает этот шаг. Забытый открытым вход стол не заводит.
 */
export function BindDeviceForm({
  onBound,
  stacked,
}: {
  onBound?: () => void;
  /** Столбиком по центру — на рабочем месте; в строку — в «Устройствах». */
  stacked?: boolean;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [station, setStation] = useState<WorkstationKind>("pack");
  const add = useCommand(workstationRepository.addDevice, { exclusive: true });
  // Привязать стол сервер даёт только с правом менять персонал: без него
  // форма лишь упёрлась бы в «не получилось». Прав нет (демо) — решает сервер.
  const canBind = useEditor(
    (s) =>
      s.session.source !== "server" ||
      !s.session.permissions ||
      s.session.permissions.includes("staff.manage"),
  );

  // Бейдж руководителя — полем прямо под «Рабочим местом», пароль — по
  // ссылке под ним, кнопка одна (Кирилл 22.11 и 24.11: шаг подтверждения
  // уезжал вниз отдельной рамкой со своей кнопкой). Поле можно оставить
  // пустым: вошёл паролем только что — сервер привяжет и так, вход давний —
  // ответит «подтвердите», и подсказка встанет под полем.
  const email = useEditor((s) => s.session.user.email);
  const onServer = useEditor((s) => s.session.source === "server");
  const [byPassword, setByPassword] = useState(false);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const confirm = (): BindConfirm | undefined =>
    byPassword
      ? password
        ? { email, password }
        : undefined
      : code.trim()
        ? { code: code.trim() }
        : undefined;
  const bind = async () => {
    const res = await add.run(name, station, confirm());
    if (res.ok) onBound?.();
  };

  if (!canBind) {
    return <p className="text-sm text-muted-foreground">{t("devices.bindNeedsManager")}</p>;
  }

  return (
    <>
      <form
        className={
          stacked
            ? "flex flex-col gap-3"
            : "grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem_auto] sm:items-end"
        }
        onSubmit={(e) => {
          e.preventDefault();
          void bind();
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">{t("devices.name")}</span>
          <Input
            className={stacked ? "h-10" : "h-9"}
            value={name}
            maxLength={60}
            placeholder={t("devices.namePlaceholder")}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">{t("devices.station")}</span>
          <Select
            value={station}
            onChange={(e) => setStation(e.target.value as WorkstationKind)}
            className={cn(
              "rounded-md border border-input bg-background px-2 text-sm",
              stacked ? "h-10" : "h-9",
            )}
          >
            {OPEN_STATIONS.map((st) => (
              <option key={st} value={st}>
                {t(`ws.station.${st}` as MsgKey)}
              </option>
            ))}
          </Select>
        </label>
        {onServer && (
          <div className="flex flex-col gap-1 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">
                {byPassword ? t("devices.managerPassword", { email }) : t("devices.managerBadge")}
              </span>
              {byPassword ? (
                <Input
                  className={stacked ? "h-10" : "h-9"}
                  type="password"
                  // Пароль руководителя на складском компьютере не запоминаем.
                  autoComplete="off"
                  value={password}
                  aria-invalid={add.error === "devices.confirmNeeded" || undefined}
                  onChange={(e) => setPassword(e.target.value)}
                />
              ) : (
                <Input
                  className={stacked ? "h-10" : "h-9"}
                  value={code}
                  placeholder="UK-STF-…"
                  autoComplete="off"
                  aria-invalid={add.error === "devices.confirmNeeded" || undefined}
                  onChange={(e) => setCode(e.target.value)}
                />
              )}
            </label>
            <PasswordSwitch byPassword={byPassword} onChange={setByPassword} />
          </div>
        )}
        {add.error && <FormError>{t(add.error)}</FormError>}
        <Button type="submit" size={stacked ? "lg" : "default"} disabled={add.pending}>
          <MonitorSmartphone />
          {t("devices.bind")}
        </Button>
      </form>
    </>
  );
}
