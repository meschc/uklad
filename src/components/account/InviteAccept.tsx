import { useEffect, useState } from "react";
import { inviteRepository, type InviteInfo } from "@/lib/data/teamRepository";
import { useT, type MsgKey } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, FormError } from "@/components/ui/field";

/**
 * Принять приглашение по ссылке из письма (`/app/#invite=…`).
 *
 * Токен живёт во фрагменте адреса: он не уходит на сервер вместе со
 * страницей и не попадает в журналы. Нет аккаунта на эту почту — человек
 * придумывает пароль и соглашается на обработку данных; есть — вводит
 * пароль от него. После принятия кука уже стоит: `onDone` ведёт в кабинет.
 */
const MIN_PASSWORD = 10;

export function InviteAccept({ token, onDone }: { token: string; onDone: () => void }) {
  const t = useT();
  // `undefined` — ещё проверяем, `null` — приглашение не действует.
  const [info, setInfo] = useState<InviteInfo | null | undefined>(undefined);
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<MsgKey | null>(null);

  useEffect(() => {
    void inviteRepository.info(token).then((res) => {
      if (res.ok) setInfo(res.data);
      else {
        setInfo(null);
        setError(res.error);
      }
    });
  }, [token]);

  if (info === undefined) {
    return <p className="text-sm text-muted-foreground">{t("team.invite.checking")}</p>;
  }
  if (info === null) {
    return (
      <div className="flex flex-col gap-3 text-center">
        <FormError>{t(error ?? "team.invite.gone")}</FormError>
        <Button variant="outline" onClick={onDone}>
          {t("common.ok")}
        </Button>
      </div>
    );
  }

  const valid = info.hasAccount ? password.length > 0 : password.length >= MIN_PASSWORD && consent;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || pending) return;
    setPending(true);
    setError(null);
    const res = await inviteRepository.accept(token, password, consent);
    setPending(false);
    if (res.ok) onDone();
    else setError(res.error);
  };

  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-1 text-center">
        <h2 className="text-base font-semibold">{t("team.invite.title")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("team.invite.lead", { company: info.company, role: info.role, email: info.email })}
        </p>
      </div>
      <label className="flex flex-col gap-1.5">
        <Label>{t(info.hasAccount ? "team.invite.oldPassword" : "team.invite.newPassword")}</Label>
        <Input
          type="password"
          autoComplete={info.hasAccount ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-9"
        />
      </label>
      {!info.hasAccount && (
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-primary"
            checked={consent}
            onChange={() => setConsent(!consent)}
          />
          <span>
            {t("login.consent.give")}{" "}
            <a href="/legal/consent" target="_blank" rel="noopener" className="underline">
              {t("login.consent.data")}
            </a>{" "}
            {t("login.consent.and")}{" "}
            <a href="/legal/privacy" target="_blank" rel="noopener" className="underline">
              {t("login.consent.privacy")}
            </a>
          </span>
        </label>
      )}
      {error && <FieldError>{t(error)}</FieldError>}
      <Button type="submit" disabled={!valid || pending}>
        {pending ? t("data.busy") : t("team.invite.accept")}
      </Button>
    </form>
  );
}
