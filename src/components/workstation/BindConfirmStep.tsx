import { useState } from "react";
import { MonitorSmartphone } from "lucide-react";
import type { BindConfirm } from "@/lib/data";
import { useEditor } from "@/lib/store";
import { useT, type MsgKey } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormError } from "@/components/ui/field";
import { ScanField } from "@/components/fulfillment/ScanField";
import { PasswordSwitch } from "./PasswordSwitch";

/**
 * Шаг «подтвердите, что привязывает руководитель» (миграция 052). Сервер
 * просит его, когда вход паролем давний: руководитель мог уйти, не выйдя.
 * Бейдж — основной путь, как на отвязке; пароль — когда бейджа нет, тем же
 * полем по ссылке под ним. Почта — того, кто вошёл: подтверждает он сам, а не
 * любой руководитель компании, поэтому её не вводят, а видят в подписи.
 */
export function BindConfirmStep({
  pending,
  error,
  onConfirm,
}: {
  pending: boolean;
  error: MsgKey | null;
  onConfirm: (confirm: BindConfirm) => void;
}) {
  const t = useT();
  const email = useEditor((s) => s.session.user.email);
  const [byPassword, setByPassword] = useState(false);
  const [password, setPassword] = useState("");

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <p className="text-sm font-medium">{t("devices.confirmNeeded")}</p>
      {byPassword ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (password) onConfirm({ email, password });
          }}
        >
          <Field label={t("devices.managerPassword", { email })}>
            <Input
              className="h-10"
              type="password"
              // Пароль руководителя на складском компьютере не запоминаем.
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <PasswordSwitch byPassword onChange={setByPassword} />
          <Button type="submit" size="lg" disabled={pending || !password}>
            <MonitorSmartphone />
            {t("devices.confirmBind")}
          </Button>
        </form>
      ) : (
        <>
          <ScanField
            label={t("devices.managerBadge")}
            placeholder="UK-STF-…"
            status={error ? "error" : "idle"}
            disabled={pending}
            actionLabel={t("devices.confirmBind")}
            onSubmit={(code) => onConfirm({ code })}
          />
          <PasswordSwitch byPassword={false} onChange={setByPassword} />
        </>
      )}
      {error && <FormError>{t(error)}</FormError>}
    </div>
  );
}
