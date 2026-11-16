import { useState } from "react";
import { MonitorX } from "lucide-react";
import { workstationRepository } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormError } from "@/components/ui/field";

/**
 * Отвязать стол паролем руководителя — тем же правом, каким его привязали.
 * Без этого стол без бейджа старшего было не отвязать: вход паролем на этом
 * компьютере погашен привязкой. Только с сервером: пароль проверяет он, и
 * новой сессии входа отвязка не открывает.
 */
export function UnbindByPassword({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const unbind = useCommand(workstationRepository.unbindDeviceByPassword);

  return (
    <form
      className="mx-auto flex w-full max-w-sm flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void unbind.run(email, password).then((res) => res.ok && onDone());
      }}
    >
      <Field label={t("login.email")}>
        <Input
          className="h-10"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Field label={t("login.password")}>
        <Input
          className="h-10"
          type="password"
          // Чужой пароль на общем компьютере браузер запоминать не должен.
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <Button type="submit" size="lg" disabled={unbind.pending}>
        <MonitorX />
        {t("ws.kiosk.unbind")}
      </Button>
      {unbind.error && <FormError>{t(unbind.error)}</FormError>}
    </form>
  );
}
