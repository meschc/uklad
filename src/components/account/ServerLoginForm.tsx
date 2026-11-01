import { useEffect, useRef, useState } from "react";
import { Check, Store, Warehouse } from "lucide-react";
import { useEditor } from "@/lib/store";
import type { UserRole } from "@/lib/types";
import { authRepository, roleOf, type ServerMe } from "@/lib/data/authRepository";
import { leaveServerSession } from "@/lib/store/leave";
import { hasDeferredCopy, hasUnsyncedChanges } from "@/lib/store/serverSync";
import type { Result } from "@/lib/data";
import { useT, type MsgKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { EmailInput } from "./EmailInput";

/**
 * Вход через сервер: пароль, регистрация с кодом из письма, сброс пароля.
 *
 * Шаги идут по коду, а не по ссылке: человек вводит шесть цифр из письма в
 * том же окне, где начал, — так не теряется место, откуда он пришёл.
 *
 * Пароль от 10 символов — так требует сервер (`password.js`). Здесь проверка
 * только чтобы не гонять заведомо пустой запрос; решает всё равно сервер.
 */
type Step = "signIn" | "signUp" | "verify" | "reset" | "resetCode";

const MIN_PASSWORD = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function ServerLoginForm() {
  const t = useT();
  const startServerSession = useEditor((s) => s.startServerSession);
  // Чьи данные сохранены на этом компьютере. Есть владелец — демо не
  // предлагаем (оно открыло бы его склад без пароля), а вход другой компанией
  // сначала предупреждает, что эти данные сотрутся.
  const ownerOrgId = useEditor((s) => s.session.orgId);
  const lastEmail = useEditor((s) => s.session.user.email);
  const [switchTo, setSwitchTo] = useState<ReturnType<typeof roleOf>>(null);

  const [step, setStep] = useState<Step>("signIn");
  const [kind, setKind] = useState<UserRole>("warehouse");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [consent, setConsent] = useState(false);
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<MsgKey | null>(null);
  // Выход не дошёл до сервера (`leaveServerSession("offline")`): говорим прямо,
  // что на сервере сессия ещё жива, — человек на чужом компьютере должен это знать.
  const [notice, setNotice] = useState<MsgKey | null>(() =>
    new URLSearchParams(window.location.search).get("logout") === "offline"
      ? "login.loggedOutOffline"
      : null,
  );

  const needsPassword = step === "signIn" || step === "signUp" || step === "resetCode";
  const needsCode = step === "verify" || step === "resetCode";
  const emailErr = EMAIL_RE.test(email.trim()) ? null : t("login.err.email");
  const passErr =
    needsPassword && password.length < MIN_PASSWORD
      ? t("login.err.password", { n: MIN_PASSWORD })
      : null;
  const codeErr = needsCode && !/^\d{6}$/.test(code.trim()) ? t("login.err.codeFormat") : null;
  const consentErr = step === "signUp" && !consent ? t("login.err.consent") : null;
  const invalid = emailErr || passErr || codeErr || consentErr;

  // Откуда пришли на ввод кода: «Изменить почту» возвращает туда же, с тем же
  // паролем, — человек правит одну опечатку, а не заполняет форму заново.
  const [codeFrom, setCodeFrom] = useState<Step>("signUp");
  const go = (next: Step, message: MsgKey | null = null) => {
    if (next === "verify" || next === "resetCode") setCodeFrom(step);
    setStep(next);
    setTouched(false);
    setError(null);
    setNotice(message);
    setCode("");
  };

  /** Кука жива: войти, если данные на компьютере свои или ничьи. */
  const admit = (me: ServerMe, mail: string) => {
    const who = roleOf(me);
    if (!who) return setError("login.err.noOrg");
    if (ownerOrgId && ownerOrgId !== who.orgId) {
      // Всё прежней компании уже на сервере — копию можно стирать молча.
      if (!hasUnsyncedChanges() && !hasDeferredCopy()) return leaveServerSession();
      return setSwitchTo(who);
    }
    startServerSession(mail, who.role, who.orgId);
  };

  /** Вошли: узнать у сервера компанию и роль, дальше — как у демо. */
  const enter = async () => {
    const me = await authRepository.me();
    if (!me.ok) return setError(me.error);
    if (!me.data) return setError("data.failed");
    admit(me.data, email.trim().toLowerCase());
  };

  // Открыли кабинет с живой кукой (после перезагрузки, после стирания чужих
  // данных) — входим сразу, без пароля ещё раз.
  const probed = useRef(false);
  useEffect(() => {
    if (probed.current) return;
    probed.current = true;
    // Выход не дошёл до сервера: кука, возможно, ещё жива — но человек вышел.
    if (notice === "login.loggedOutOffline") return;
    void authRepository.me().then((me) => {
      if (me.ok && me.data) admit(me.data, lastEmail);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- одна проверка при открытии
  }, []);

  /** Одна команда к серверу: ожидание на кнопке, отказ — строкой под формой. */
  async function run<T>(op: () => Promise<Result<T>>, then: (data: T) => Promise<void> | void) {
    setPending(true);
    setError(null);
    try {
      const res = await op();
      if (res.ok) await then(res.data);
      else setError(res.error);
    } finally {
      setPending(false);
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (invalid || pending) return;
    const mail = email.trim();
    const digits = code.trim();
    switch (step) {
      case "signIn":
        return run(
          () => authRepository.login(mail, password),
          async (outcome) => {
            if (outcome === "signedIn") return enter();
            // Пароль верный, а почта не подтверждена: шлём код заново и ждём его.
            await authRepository.sendCode(mail, "verify");
            go("verify", "login.codeSent");
          },
        );
      case "signUp":
        return run(
          () => authRepository.register(mail, password, kind === "seller" ? "seller" : "warehouse"),
          () => go("verify", "login.codeSent"),
        );
      case "verify":
        return run(() => authRepository.verify(mail, digits), enter);
      case "reset":
        return run(
          () => authRepository.sendCode(mail, "reset"),
          () => go("resetCode", "login.codeSent"),
        );
      case "resetCode":
        return run(() => authRepository.reset(mail, digits, password), enter);
    }
  };

  const resend = () =>
    run(
      () => authRepository.sendCode(email.trim(), step === "verify" ? "verify" : "reset"),
      () => setNotice("login.codeResent"),
    );

  const shown = (message: string | null) => (touched ? message : null);
  const submitKey: Record<Step, MsgKey> = {
    signIn: "login.submit.signIn",
    signUp: "login.submit.signUp",
    verify: "login.submit.verify",
    reset: "login.submit.sendCode",
    resetCode: "login.submit.newPassword",
  };

  if (switchTo) {
    // Вход другой компанией: данные прежней на этом компьютере сотрутся. Копию
    // здесь не предлагаем — она отдала бы чужие данные вошедшему.
    return (
      <div className="flex w-full flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <p className="text-sm">{t("login.switch.body")}</p>
        <Button variant="destructive" onClick={() => leaveServerSession()}>
          {t("login.switch.confirm")}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setSwitchTo(null);
            void authRepository.logout();
          }}
        >
          {t("login.switch.cancel")}
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="w-full rounded-2xl border border-border bg-card p-5 shadow-sm">
        {(step === "signIn" || step === "signUp") && (
          <Segmented
            size="md"
            grow
            className="mb-4"
            value={step}
            onChange={(s) => go(s)}
            options={[
              { value: "signIn" as Step, label: t("login.tab.signIn") },
              { value: "signUp" as Step, label: t("login.tab.signUp") },
            ]}
          />
        )}

        {step === "signUp" && (
          <div className="mb-3 flex flex-col gap-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {t("login.roleTitle")}
            </Label>
            <Segmented
              size="md"
              grow
              value={kind}
              onChange={setKind}
              options={[
                { value: "warehouse", label: t("role.warehouse"), icon: <Warehouse /> },
                { value: "seller", label: t("role.seller"), icon: <Store /> },
              ]}
            />
            <p className="text-xs text-muted-foreground">
              {t(kind === "warehouse" ? "login.roleWarehouse" : "login.roleSeller")}
            </p>
          </div>
        )}

        <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
          {notice && notice !== "login.codeSent" && (
            <p className="text-sm text-muted-foreground">{t(notice, { email: email.trim() })}</p>
          )}

          {needsCode ? (
            // Почта крупно (Кирилл 1 ноя): письмо не дошло чаще всего из-за
            // опечатки в адресе, и её должно быть видно с первого взгляда.
            <div className="flex flex-col items-start gap-1">
              <p className="text-sm text-muted-foreground">{t("login.codeSentTo")}</p>
              <p className="break-all text-lg font-semibold leading-snug">{email.trim()}</p>
              <button
                type="button"
                className="text-sm text-primary underline-offset-4 hover:underline"
                onClick={() => go(codeFrom)}
              >
                {t("login.changeEmail")}
              </button>
              <p className="mt-1 text-xs text-muted-foreground">{t("login.codeSpam")}</p>
            </div>
          ) : (
            <Field label={t("login.email")} error={shown(emailErr)}>
              <EmailInput
                value={email}
                onValueChange={setEmail}
                placeholder={t("profile.emailPlaceholder")}
                className={cn("h-9", shown(emailErr) && "border-destructive")}
              />
            </Field>
          )}

          {needsCode && (
            <Field label={t("login.code")} error={shown(codeErr)}>
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className={cn("h-9 tracking-widest", shown(codeErr) && "border-destructive")}
              />
            </Field>
          )}

          {needsPassword && (
            <Field
              label={t(step === "resetCode" ? "login.newPassword" : "login.password")}
              error={shown(passErr)}
            >
              <Input
                type="password"
                autoComplete={step === "signIn" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("login.passwordPlaceholder")}
                className={cn("h-9", shown(passErr) && "border-destructive")}
              />
            </Field>
          )}

          {step === "signUp" && (
            <ConsentRow checked={consent} onToggle={() => setConsent(!consent)}>
              {t("login.consent.give")}{" "}
              <a href="/legal/consent" target="_blank" rel="noopener" className="underline">
                {t("login.consent.data")}
              </a>{" "}
              {t("login.consent.and")}{" "}
              <a href="/legal/privacy" target="_blank" rel="noopener" className="underline">
                {t("login.consent.privacy")}
              </a>
            </ConsentRow>
          )}
          {shown(consentErr) && <span className="text-xs text-destructive">{consentErr}</span>}

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {t(error)}
            </p>
          )}

          <Button type="submit" className="mt-1 w-full" disabled={pending}>
            {pending ? t("data.busy") : t(submitKey[step])}
          </Button>

          {needsCode && (
            <Button type="button" variant="ghost" disabled={pending} onClick={resend}>
              {t("login.resend")}
            </Button>
          )}

          {/* Демо открывается не со входа, а по заявке: ссылку присылает письмо
              (`/d/<токен>`), так мы знаем, кто смотрит, и почта настоящая. */}
          {(step === "signIn" || step === "signUp") && (
            <p className="text-center text-xs text-muted-foreground">
              {t("login.demoByRequest")}
              <br />
              <a href="/#demo" className="underline">
                {t("login.demoRequest")}
              </a>
            </p>
          )}
        </form>
      </div>

      <div className="flex flex-col items-center gap-1.5">
        {step === "signIn" ? (
          <button
            type="button"
            onClick={() => go("reset")}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {t("login.forgot")}
          </button>
        ) : step !== "signUp" ? (
          <button
            type="button"
            onClick={() => go("signIn")}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {t("login.backToSignIn")}
          </button>
        ) : null}
      </div>
    </>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {/* Как на формах витрины: обычная подпись, без капса и значков. */}
      <label className="text-sm font-medium">{label}</label>
      {children}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

/**
 * Согласие на обработку данных — отдельной галочкой и пустой по умолчанию:
 * проставленная заранее галочка согласием не считается (152-ФЗ).
 */
function ConsentRow({
  checked,
  onToggle,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 text-xs text-muted-foreground">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={onToggle}
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
          checked
            ? "border-primary bg-primary text-primary-foreground"
            : "border-input bg-background",
        )}
      >
        {checked && <Check className="size-3" />}
      </button>
      <span>{children}</span>
    </div>
  );
}
