import { useState } from "react";
import { Mail, ShieldCheck } from "lucide-react";
import { useEditor } from "@/lib/store";
import { checkEmail } from "@/lib/validate";
import { accountRepository } from "@/lib/data/accountRepository";
import { ok, type Result } from "@/lib/data/result";
import { useCommand } from "@/lib/useCommand";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormError } from "@/components/ui/field";
import { Row, ReadValue, RowEditor } from "./ProfileRow";

const CODE_LENGTH = 6;

// Демо живёт в браузере, писем там нет: «отправка» и «проверка» кода сразу
// проходят, а экран честно говорит, что подойдёт любой код.
const demoRequest = async (_email: string, _password: string): Promise<Result<void>> =>
  ok(undefined);
const demoConfirm = async (_code: string): Promise<Result<string>> => ok("");

/**
 * Смена почты (Кирилл 24.11: «почему смена почты не настоящая?»).
 *
 * Как у Google: новый адрес и свой пароль → код на НОВЫЙ адрес → после кода
 * вход по новой почте, другие устройства выходят, на старый адрес — письмо
 * (`server/api/src/cabinet/account.js`, миграция 066). До кода старая почта
 * работает. В демо писем нет: подойдёт любой код, и это сказано на экране.
 */
export function EmailRow() {
  const t = useT();
  const email = useEditor((s) => s.profile.email);
  const updateProfile = useEditor((s) => s.updateProfile);
  const server = useEditor((s) => s.session.source === "server");

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [password, setPassword] = useState("");
  /** Адрес, на который ушёл код. */
  const [pending, setPending] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [done, setDone] = useState(false);

  const request = useCommand(server ? accountRepository.requestEmailChange : demoRequest, {
    exclusive: true,
  });
  const confirm = useCommand(server ? accountRepository.confirmEmailChange : demoConfirm, {
    exclusive: true,
  });

  const next = draft.trim().toLowerCase();
  const emailErr = next ? checkEmail(next) : ("valid.email" as const);
  const canSend = !emailErr && (!server || !!password) && !request.pending;

  const close = () => {
    setEditing(false);
    setPassword("");
    request.reset();
  };

  const send = async () => {
    if (!canSend) return;
    if (next === email.trim().toLowerCase()) return close();
    const res = await request.run(next, password);
    if (!res.ok) return;
    setPending(next);
    setCode("");
    confirm.reset();
    close();
  };

  const apply = async () => {
    if (code.length !== CODE_LENGTH || !pending) return;
    const res = await confirm.run(code);
    if (!res.ok) return;
    updateProfile({ email: res.data || pending });
    setPending(null);
    setCode("");
    setDone(true);
  };

  return (
    <>
      <Row icon={<Mail className="size-4" />} label={t("profile.email")}>
        {editing ? (
          <RowEditor
            onSave={() => void send()}
            onCancel={close}
            canSave={canSend}
            hint={
              emailErr && next
                ? { text: t(emailErr), error: true }
                : { text: t("profile.emailNeedsConfirm") }
            }
          >
            <div className="flex flex-col gap-2">
              <Input
                // eslint-disable-next-line jsx-a11y/no-autofocus -- строчный редактор открыт по клику «изменить»: фокус обязан уйти в поле
                autoFocus
                type="email"
                autoComplete="email"
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  request.reset();
                }}
                placeholder={t("profile.emailPlaceholder")}
                aria-invalid={(!!emailErr && !!next) || undefined}
                className="h-9 w-full"
              />
              {server && (
                <Input
                  type="password"
                  autoComplete="current-password"
                  aria-label={t("profile.emailPassword")}
                  placeholder={t("profile.emailPassword")}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    request.reset();
                  }}
                  className="h-9 w-full"
                />
              )}
              {request.error && <FormError>{t(request.error)}</FormError>}
            </div>
          </RowEditor>
        ) : (
          <div className="flex min-w-0 flex-col gap-1">
            <ReadValue
              value={email}
              onEdit={() => {
                setDraft(email);
                setDone(false);
                setEditing(true);
              }}
            />
            {done && (
              <span className="text-sm text-muted-foreground">{t("profile.emailDone")}</span>
            )}
          </div>
        )}
      </Row>

      {pending && (
        <div className="flex flex-col gap-2 rounded-xl border border-warning-fill/70 bg-warning-fill/25 p-3.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-warning-ink">
            <ShieldCheck className="size-3.5" />
            {t("profile.emailConfirmTitle", { email: pending })}
          </p>
          <p className="text-xs text-warning-ink/80">
            {t(server ? "profile.emailConfirmBody" : "profile.emailDemoCode", { n: CODE_LENGTH })}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={code}
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label={t("profile.emailConfirmApply")}
              maxLength={CODE_LENGTH}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, ""));
                confirm.reset();
              }}
              placeholder="000000"
              className="h-9 w-28 text-center font-mono tracking-widest"
            />
            <Button
              size="sm"
              className="h-9"
              disabled={code.length !== CODE_LENGTH || confirm.pending}
              onClick={() => void apply()}
            >
              {t("profile.emailConfirmApply")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-9"
              onClick={() => {
                setPending(null);
                setCode("");
                confirm.reset();
              }}
            >
              {t("common.cancel")}
            </Button>
          </div>
          {confirm.error && <FormError>{t(confirm.error)}</FormError>}
        </div>
      )}
    </>
  );
}
