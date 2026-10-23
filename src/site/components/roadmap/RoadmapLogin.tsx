import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Mail, X } from "lucide-react";
import { DialogShell } from "@/components/ui/dialog-shell";
import { ConsentChecks, type ConsentState } from "../ConsentChecks";
import { ru, useT } from "../../lib/copy";
import { useOverlay } from "../../lib/useOverlay";
import { closeDialog, port, requestCode, verifyCode } from "../../lib/roadmap/store";
import type { RoadmapError } from "../../lib/roadmap/port";

const T = {
  title: ru("Вход по почте"),
  lead: ru(
    "Голоса и идеи привязаны к почте: так мы сможем написать, когда идею возьмём в работу. Пароль не нужен, пришлём код.",
  ),
  email: ru("Почта"),
  emailPh: ru("name@company.ru"),
  getCode: ru("Получить код"),
  sending: ru("Отправляем…"),
  codeTitle: ru("Введите код из письма"),
  codeLead: ru("Отправили шесть цифр на {email}."),
  code: ru("Код"),
  enter: ru("Войти"),
  checking: ru("Проверяем…"),
  again: ru("Отправить ещё раз"),
  againIn: ru("Отправить ещё раз через {sec} с"),
  back: ru("Другая почта"),
  close: ru("Закрыть"),
  devNote: ru("Сервер ещё не подключён, письмо не уходит. Код для проверки: {code}"),
  needConsent: ru("Отметьте согласие на обработку данных: без него войти нельзя."),
  badEmail: ru("Проверьте адрес почты."),
};

const ERRORS: Record<RoadmapError, string> = {
  network: "Нет связи с сервером. Попробуйте ещё раз.",
  invalid: "Что-то пошло не так. Попробуйте ещё раз.",
  code: "Код не подошёл. Проверьте цифры.",
  expired: "Код устарел. Отправьте новый.",
  auth: "Войдите ещё раз.",
  limit: "Слишком много попыток. Подождите минуту.",
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_SEC = 60;

/**
 * Вход на дорожную карту: почта → код из письма (Кирилл, 21 окт).
 *
 * Без пароля: заводить его ради голоса — лишний шаг, на котором человек
 * уходит. Согласие на обработку данных — здесь, один раз: почта и есть
 * персональные данные. Подсказки — после попытки и под кнопкой, как в
 * заявке складов.
 */
export function RoadmapLogin() {
  const t = useT();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [consent, setConsent] = useState<ConsentState>({ data: false, ads: false });
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useOverlay(true, closeDialog);

  useEffect(() => {
    if (wait <= 0) return;
    const id = window.setTimeout(() => setWait((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [wait]);

  const send = async () => {
    const clean = email.trim().toLowerCase();
    if (!EMAIL.test(clean)) return setHint(t(T.badEmail));
    if (!consent.data) return setHint(t(T.needConsent));
    setBusy(true);
    setHint(null);
    const res = await requestCode(clean, consent);
    setBusy(false);
    if (!res.ok) return setHint(ERRORS[res.error]);
    setEmail(clean);
    setDevCode(port.live ? null : (res.data.devCode ?? null));
    setStep("code");
    setWait(RESEND_SEC);
    window.setTimeout(() => codeRef.current?.focus(), 0);
  };

  const enter = async () => {
    setBusy(true);
    setHint(null);
    const error = await verifyCode(email, code.trim());
    setBusy(false);
    if (error) setHint(ERRORS[error]);
  };

  return (
    <DialogShell size="md" onClose={closeDialog}>
      <div className="wh p-6 sm:p-8">
        <div className="flex items-start justify-between gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-[var(--wh-blue)] text-[var(--wh-on-blue)]">
            <Mail className="size-5" />
          </span>
          <button
            type="button"
            onClick={closeDialog}
            aria-label={t(T.close)}
            className="grid size-9 place-items-center rounded-full transition-colors hover:bg-[var(--wh-soft)]"
          >
            <X className="size-4" />
          </button>
        </div>

        {step === "email" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="mt-4 flex flex-col gap-4"
          >
            <div>
              <h2 className="text-2xl font-heading tracking-tight">{t(T.title)}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--wh-muted)]">{t(T.lead)}</p>
            </div>
            <div>
              <label htmlFor="roadmap-email" className="text-sm font-medium">
                {t(T.email)}
              </label>
              <input
                id="roadmap-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t(T.emailPh)}
                className="mt-1.5 h-12 w-full rounded-xl border border-border bg-background px-4 text-base outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-[var(--wh-blue)]"
              />
            </div>
            <ConsentChecks value={consent} onChange={setConsent} />
            <SubmitButton busy={busy} idle={t(T.getCode)} pending={t(T.sending)} />
            {hint && <Hint text={hint} />}
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void enter();
            }}
            className="mt-4 flex flex-col gap-4"
          >
            <div>
              <h2 className="text-2xl font-heading tracking-tight">{t(T.codeTitle)}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--wh-muted)]">
                {t(T.codeLead, { email })}
              </p>
            </div>
            {devCode && (
              <p className="rounded-xl bg-[var(--wh-soft)] px-4 py-3 text-sm">
                {t(T.devNote, { code: devCode })}
              </p>
            )}
            <div>
              <label htmlFor="roadmap-code" className="text-sm font-medium">
                {t(T.code)}
              </label>
              <input
                id="roadmap-code"
                ref={codeRef}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="mt-1.5 h-12 w-full rounded-xl border border-border bg-background px-4 font-mono text-xl tracking-[0.4em] outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-[var(--wh-blue)]"
              />
            </div>
            <SubmitButton
              busy={busy}
              idle={t(T.enter)}
              pending={t(T.checking)}
              disabled={code.length !== 6}
            />
            {hint && <Hint text={hint} />}
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setCode("");
                  setHint(null);
                }}
                className="inline-flex items-center gap-1 text-[var(--wh-muted)] hover:text-[var(--wh-ink)]"
              >
                <ArrowLeft className="size-4" />
                {t(T.back)}
              </button>
              <button
                type="button"
                disabled={wait > 0 || busy}
                onClick={() => void send()}
                className="tabular-nums text-[var(--wh-blue)] disabled:text-[var(--wh-muted)]"
              >
                {wait > 0 ? t(T.againIn, { sec: wait }) : t(T.again)}
              </button>
            </div>
          </form>
        )}
      </div>
    </DialogShell>
  );
}

export function SubmitButton({
  busy,
  idle,
  pending,
  disabled,
}: {
  busy: boolean;
  idle: string;
  pending: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      className="wh-btn wh-btn--blue h-12 w-full justify-center disabled:opacity-50"
    >
      {busy ? pending : idle}
    </button>
  );
}

export function Hint({ text }: { text: string }) {
  return (
    <p role="alert" className="-mt-1 text-xs leading-relaxed text-destructive">
      {text}
    </p>
  );
}
