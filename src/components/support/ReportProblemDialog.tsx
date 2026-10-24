import { useMemo, useState } from "react";
import { CheckCircle2, LifeBuoy, X } from "lucide-react";
import { PERSIST_KEY, useEditor } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { useCommand } from "@/lib/useCommand";
import { buildReport, readEnv, reportSize, sendReport } from "@/lib/support/report";
import { journal } from "@/lib/support/journal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DialogFooter, DialogHeader, DialogShell } from "@/components/ui/dialog-shell";

/**
 * «Сообщить о проблеме» (план поддержки, п.2): человек пишет, что случилось,
 * и отправляет вместе с журналом событий и — по галочке — обезличенной копией
 * данных склада.
 *
 * Перед отправкой окно показывает, что именно уйдёт: и сводку («заменено
 * имён: 12»), и сам текст по кнопке «Показать». Отдавать данные вслепую
 * человек не должен, даже обезличенные.
 *
 * Копия берётся из сохранённого состояния, а не из живого стора: в живом есть
 * открытые окна и выделение, к ошибке они не относятся, а сохранённое — ровно
 * то, что увидит кабинет после перезагрузки.
 */

function savedState(): unknown | null {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    return raw ? ((JSON.parse(raw) as { state?: unknown }).state ?? null) : null;
  } catch {
    return null;
  }
}

const now = () => Date.now();
const msSince = (t: number) => Date.now() - t;

export function ReportProblemDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const view = useEditor((s) => s.appView);
  const [message, setMessage] = useState("");
  const [withSnapshot, setWithSnapshot] = useState(true);
  const [preview, setPreview] = useState(false);
  const [sentId, setSentId] = useState<number | null>(null);
  const [website, setWebsite] = useState("");
  const [openedAt] = useState(now);
  const send = useCommand(sendReport);

  // Журнал и копия читаются один раз на открытие окна: пока человек пишет,
  // они не меняются, а пересобирать снимок склада на каждую букву дорого.
  const entries = useMemo(() => journal.read(), []);
  const state = useMemo(() => savedState(), []);
  const snapshotReport = useMemo(
    () => buildReport({ message: "", env: readEnv(view), state, entries }),
    [view, state, entries],
  );
  const report = {
    ...snapshotReport,
    message: buildReport({ message, env: snapshotReport.env, state: null, entries }).message,
    snapshot: withSnapshot ? snapshotReport.snapshot : undefined,
  };
  const kb = Math.max(1, Math.round(reportSize(report) / 1024));
  const stats = snapshotReport.snapshot?.stats;

  const submit = async () => {
    const res = await send.run({ ...report, website, elapsedMs: msSince(openedAt) });
    if (res.ok) setSentId(res.data.id);
  };

  return (
    <DialogShell size="lg" scroll onClose={onClose}>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <LifeBuoy className="size-4 text-muted-foreground" />
          <p className="text-sm font-semibold">{t("support.title")}</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t("support.close")}>
          <X className="size-4" />
        </Button>
      </DialogHeader>

      {sentId !== null ? (
        <div className="flex flex-col items-center gap-2 px-5 py-8 text-center">
          <CheckCircle2 className="size-8 text-primary" />
          <p className="text-sm font-semibold">{t("support.sent.title", { id: sentId })}</p>
          <p className="max-w-sm text-sm text-muted-foreground">{t("support.sent.body")}</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          <p className="text-sm text-muted-foreground">{t("support.lead")}</p>

          <label className="flex flex-col gap-1.5">
            <Label>{t("support.message")}</Label>
            <textarea
              value={message}
              rows={4}
              maxLength={4000}
              // eslint-disable-next-line jsx-a11y/no-autofocus -- окно открыто ради этого поля
              autoFocus
              placeholder={t("support.message.placeholder")}
              onChange={(e) => setMessage(e.target.value)}
              className="min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </label>

          <div className="rounded-md bg-muted/40 px-3 py-2.5 text-sm">
            <p className="font-medium">{t("support.journal", { n: entries.length })}</p>
            <p className="text-xs text-muted-foreground">{t("support.journal.hint")}</p>
          </div>

          {/* Ловушка для ботов: человек это поле не видит и не заполняет. */}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            className="sr-only"
          />

          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={withSnapshot && state != null}
              disabled={state == null}
              onChange={(e) => setWithSnapshot(e.target.checked)}
              className="mt-0.5 size-4 accent-primary"
            />
            <span>
              <span className="block text-sm">{t("support.snapshot")}</span>
              <span className="block text-xs text-muted-foreground">
                {t("support.snapshot.hint")}
              </span>
              {stats && withSnapshot && (
                <span className="mt-1 block text-xs tabular-nums text-muted-foreground">
                  {t("support.snapshot.stats", { ...stats })}
                </span>
              )}
            </span>
          </label>

          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <button
              type="button"
              onClick={() => setPreview((v) => !v)}
              className="text-primary underline-offset-4 hover:underline"
            >
              {preview ? t("support.preview.hide") : t("support.preview.show")}
            </button>
            <span className="tabular-nums">{t("support.size", { kb })}</span>
          </div>
          {preview && (
            <pre className="max-h-64 overflow-auto rounded-md border border-border bg-muted/30 p-3 text-2xs leading-relaxed">
              {JSON.stringify(report, null, 2)}
            </pre>
          )}

          {send.error && (
            <p role="alert" className="text-sm text-destructive">
              {t(send.error)}
            </p>
          )}
        </div>
      )}

      <DialogFooter>
        {sentId !== null ? (
          <Button onClick={onClose}>{t("support.close")}</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button onClick={submit} disabled={send.pending || message.trim().length === 0}>
              {t("support.send")}
            </Button>
          </>
        )}
      </DialogFooter>
    </DialogShell>
  );
}
