import { useState } from "react";
import { Boxes, Lock, Mail, Store, Warehouse } from "lucide-react";
import { useEditor } from "@/lib/store";
import type { UserRole } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { AsciiBackdrop } from "./AsciiBackdrop";

/**
 * Вход, регистрация и восстановление пароля (п.28). Авторизации в прототипе
 * нет, поэтому экран проверяет то, что можно проверить на клиенте: формат
 * почты и длину пароля. Всё остальное (существует ли аккаунт, письмо со
 * сбросом) честно показано как заглушка — иначе интерфейс обещал бы то, чего
 * за ним не стоит.
 *
 * В регистрации только почта и пароль (п.3): имя и компания — это профиль, а не
 * пропуск в систему, их правят в настройках и по ИНН. Роль остаётся: она решает
 * не «какие поля заполнить», а куда человек попадёт после входа.
 */
type Mode = "signIn" | "signUp" | "reset";

const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function LoginScreen() {
  const goToDashboard = useEditor((s) => s.goToDashboard);
  const profile = useEditor((s) => s.profile);
  const updateProfile = useEditor((s) => s.updateProfile);
  const setRole = useEditor((s) => s.setRole);
  const t = useT();

  const [mode, setMode] = useState<Mode>("signIn");
  const [role, setLocalRole] = useState<UserRole>("warehouse");
  const [email, setEmail] = useState(profile.email);
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const emailErr = !EMAIL_RE.test(email.trim()) ? t("login.err.email") : null;
  const passErr =
    mode === "reset"
      ? null
      : password.length < MIN_PASSWORD
        ? t("login.err.password", { n: MIN_PASSWORD })
        : null;
  const invalid = emailErr || passErr;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (invalid) return;

    if (mode === "reset") {
      setResetSent(true);
      return;
    }
    updateProfile({ email: email.trim() });
    // Роль решает, куда человек попадёт: продавцу склад не нужен, ему нужны
    // остатки и заявки. setRole сам уводит на «свой» стартовый экран.
    setRole(role);
    if (role === "warehouse") goToDashboard();
  };

  const demo = () => {
    setRole("warehouse");
    goToDashboard();
  };

  const err = (message: string | null) => (touched ? message : null);

  return (
    <div className="flex h-full overflow-hidden bg-background">
      {/* Левая половина — форма */}
      <div className="no-scrollbar flex min-w-0 flex-1 items-center justify-center overflow-y-auto px-6 py-10">
        <div className="flex w-full max-w-sm flex-col items-center gap-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <Boxes className="size-6" />
            </span>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Уклад</h1>
              <p className="text-sm text-muted-foreground">{t("login.tagline")}</p>
            </div>
          </div>

          <div className="w-full rounded-2xl border border-border bg-card p-5 shadow-sm">
            <Segmented
              size="md"
              grow
              className="mb-4"
              value={mode === "reset" ? "signIn" : mode}
              onChange={(m) => {
                setMode(m);
                setTouched(false);
                setResetSent(false);
              }}
              options={[
                { value: "signIn" as Mode, label: t("login.tab.signIn") },
                { value: "signUp" as Mode, label: t("login.tab.signUp") },
              ]}
            />

            {mode === "signUp" && (
              <div className="mb-3 flex flex-col gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  {t("login.roleTitle")}
                </Label>
                <Segmented
                  size="md"
                  grow
                  value={role}
                  onChange={setLocalRole}
                  options={[
                    { value: "warehouse", label: t("role.warehouse"), icon: <Warehouse /> },
                    { value: "seller", label: t("role.seller"), icon: <Store /> },
                  ]}
                />
                <p className="text-[11px] text-muted-foreground">
                  {t(role === "warehouse" ? "login.roleWarehouse" : "login.roleSeller")}
                </p>
              </div>
            )}

            <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
              <LoginField
                icon={<Mail className="size-4" />}
                label={t("login.email")}
                error={err(emailErr)}
              >
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("profile.emailPlaceholder")}
                  className={cn("h-9", err(emailErr) && "border-destructive")}
                />
              </LoginField>

              {mode !== "reset" && (
                <LoginField
                  icon={<Lock className="size-4" />}
                  label={t("login.password")}
                  error={err(passErr)}
                >
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t("login.passwordPlaceholder")}
                    className={cn("h-9", err(passErr) && "border-destructive")}
                  />
                </LoginField>
              )}

              {resetSent && (
                <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-2 text-[11px] text-emerald-700 dark:text-emerald-400">
                  {t("login.resetSent", { email: email.trim() })}
                </p>
              )}

              <Button type="submit" className="mt-1 w-full">
                {t(
                  mode === "signIn"
                    ? "login.submit.signIn"
                    : mode === "signUp"
                      ? "login.submit.signUp"
                      : "login.submit.reset",
                )}
              </Button>

              {/* Демо — вход в готовый склад без регистрации (п.28). */}
              <Button type="button" variant="outline" className="w-full" onClick={demo}>
                {t("login.demo")}
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">
                {t("login.demoHint")}
              </p>
            </form>
          </div>

          <div className="flex flex-col items-center gap-1.5">
            {mode !== "reset" ? (
              <button
                type="button"
                onClick={() => {
                  setMode("reset");
                  setTouched(false);
                }}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                {t("login.forgot")}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMode("signIn");
                  setTouched(false);
                  setResetSent(false);
                }}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                {t("login.backToSignIn")}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Правая половина — ASCII-волна. На узком экране прячется: форма важнее. */}
      {/* Правая половина — ASCII-полотно во всю высоту, отвечает на курсор.
          На узком экране прячется: форма важнее. */}
      <div className="relative hidden min-w-0 flex-1 overflow-hidden border-l border-border bg-muted/30 lg:block">
        {/* Подписи здесь нет: она уже есть под логотипом, а на волне читалась
            как мусор. */}
        <AsciiBackdrop className="absolute inset-0 select-none text-primary/35" />
      </div>
    </div>
  );
}

function LoginField({
  icon,
  label,
  error,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <span className="text-muted-foreground/70">{icon}</span>
        {label}
      </Label>
      {children}
      {error && <span className="text-[11px] text-destructive">{error}</span>}
    </div>
  );
}
