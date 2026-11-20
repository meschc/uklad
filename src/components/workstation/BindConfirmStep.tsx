import { useState } from "react";
import { MonitorSmartphone } from "lucide-react";
import type { BindConfirm } from "@/lib/data";
import { useEditor } from "@/lib/store";
import { useT, type MsgKey } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormError } from "@/components/ui/field";
import { ScanField } from "@/components/fulfillment/ScanField";

/**
 * Шаг «подтвердите, что привязывает руководитель» (миграция 052). Сервер
 * просит его, когда вход паролем давний: руководитель мог уйти, не выйдя.
 * Бейдж — основной путь, как на отвязке; пароль — когда бейджа нет. Почта —
 * того, кто вошёл: подтверждает он сам, а не любой руководитель компании.
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
          <Field label={t("login.email")}>
            <Input className="h-10" value={email} readOnly />
          </Field>
          <Field label={t("login.password")}>
            <Input
              className="h-10"
              type="password"
              // Пароль руководителя на складском компьютере не запоминаем.
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
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
          <Button variant="outline" className="self-center" onClick={() => setByPassword(true)}>
            {t("devices.byPassword")}
          </Button>
        </>
      )}
      {error && <FormError>{t(error)}</FormError>}
    </div>
  );
}
