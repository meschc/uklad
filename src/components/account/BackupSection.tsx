import { useRef, useState } from "react";
import { BellRing, Download, Mail, Upload } from "lucide-react";
import { useEditor, PERSIST_VERSION } from "@/lib/store";
import { backupRepository } from "@/lib/data";
import { parseBackup } from "@/lib/backup";
import { REMIND_OPTIONS, featuresOf } from "@/lib/tariff";
import { useCommand } from "@/lib/useCommand";
import { TariffLock } from "@/components/tariff/TariffLock";
import { useT, type MsgKey } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Row } from "./ProfileRow";
import { downloadBackup } from "./backupDownload";
import { FieldError } from "@/components/ui/field";

/**
 * Резервная копия: скачать архив, восстановить из него, срок напоминания и
 * копия на почту. Восстановление стирает текущие данные, поэтому в два шага:
 * сначала файл разбирается и показывается его дата, потом подтверждение.
 *
 * С сервером — только «Скачать архив» (Кирилл 23.11): копию всех данных сервер
 * делает сам каждую ночь, напоминать о ней незачем; письма с копией сервер не
 * шлёт; а восстановление из файла заменило бы данные компании на сервере
 * старым архивом с одного устройства. Остальное живёт в демо без сервера.
 */
/** Предел размера архива: больше — не читаем. */
const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

export function BackupSection() {
  const t = useT();
  const backup = useEditor((s) => s.subscription.backup);
  const canEmail = useEditor((s) => featuresOf(s.subscription).weeklyEmailBackup);
  const email = useEditor((s) => s.profile.email);
  const update = useEditor((s) => s.updateBackupSettings);
  const fileRef = useRef<HTMLInputElement>(null);
  const onServer = useEditor((s) => s.session.source === "server");

  const download = useCommand(downloadBackup);
  const restore = useCommand(backupRepository.restoreArchive, { exclusive: true });
  const weekly = useCommand(backupRepository.setWeeklyEmail);

  /** Разобранный, но ещё не подтверждённый архив. */
  const [pending, setPending] = useState<{ text: string; createdAt: string } | null>(null);
  const [pickError, setPickError] = useState<MsgKey | null>(null);

  const fmt = (d: string | number) =>
    new Date(d).toLocaleDateString(t.lang, { day: "numeric", month: "long" });

  const pick = async (file: File) => {
    restore.reset();
    // Проверка размера до чтения: огромный файл подвесил бы вкладку и всё
    // равно не влез бы в хранилище браузера.
    if (file.size > MAX_BACKUP_BYTES) {
      setPending(null);
      setPickError("backup.err.tooBig");
      return;
    }
    const text = await file.text();
    const parsed = parseBackup(text, PERSIST_VERSION);
    if (!parsed.ok) {
      setPending(null);
      setPickError(parsed.error);
      return;
    }
    setPickError(null);
    setPending({ text, createdAt: parsed.file.createdAt });
  };

  const confirmRestore = async () => {
    if (!pending) return;
    const res = await restore.run(pending.text);
    // Перезагрузка, а не пересборка стора на месте: архив должен пройти те же
    // миграции и проверку формы, что и обычный запуск.
    if (res.ok) window.location.reload();
  };

  const restoreError = pickError ?? restore.error;

  return (
    <div className="flex flex-col divide-y divide-border/60">
      <Row icon={<Download className="size-4" />} label={t("backup.archive")}>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {download.error && <FieldError>{t(download.error)}</FieldError>}
          <span className="text-xs text-muted-foreground">
            {backup.lastBackupAt
              ? t("backup.last", { date: fmt(backup.lastBackupAt) })
              : t("backup.never")}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={download.pending}
            onClick={() => download.run()}
          >
            {t("backup.download")}
          </Button>
        </div>
      </Row>

      {onServer ? (
        <p className="px-4 py-3 text-xs text-muted-foreground">{t("backup.serverNote")}</p>
      ) : (
        <>
          <Row icon={<Upload className="size-4" />} label={t("backup.restore")}>
            <div className="flex flex-col items-end gap-2">
              {restoreError && <FieldError>{t(restoreError)}</FieldError>}
              {pending ? (
                <>
                  {/* Предупреждение отдельной строкой над кнопками: в одну линию с
                  ними оно переносилось по слову и толкало кнопки. */}
                  <FieldError className="max-w-64 text-right">
                    {t("backup.restoreWarn", {
                      date: pending.createdAt ? fmt(pending.createdAt) : "—",
                    })}
                  </FieldError>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => setPending(null)}>
                      {t("common.cancel")}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={restore.pending}
                      onClick={confirmRestore}
                    >
                      {t("backup.restoreConfirm")}
                    </Button>
                  </div>
                </>
              ) : (
                <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                  {t("backup.pick")}
                </Button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void pick(f);
                }}
              />
            </div>
          </Row>

          <Row icon={<BellRing className="size-4" />} label={t("backup.remind")}>
            <Segmented<string>
              value={String(backup.remindEveryDays)}
              onChange={(v) => update({ remindEveryDays: Number(v), snoozedUntil: undefined })}
              options={REMIND_OPTIONS.map((d) => ({
                value: String(d),
                label: t(`backup.remind.${d}`),
              }))}
            />
          </Row>

          <div className="flex flex-col gap-1.5">
            <Row icon={<Mail className="size-4" />} label={t("backup.email")}>
              {canEmail ? (
                <Segmented<"on" | "off">
                  value={backup.emailWeekly ? "on" : "off"}
                  onChange={(v) => void weekly.run(v === "on")}
                  options={[
                    { value: "off", label: t("backup.email.off") },
                    { value: "on", label: t("backup.email.on") },
                  ]}
                />
              ) : (
                <TariffLock feature="weeklyEmailBackup" />
              )}
            </Row>
            {weekly.error && <FieldError className="px-4 pb-3">{t(weekly.error)}</FieldError>}
            {canEmail && backup.emailWeekly && (
              <p className="px-4 pb-3 text-xs text-muted-foreground">
                {t("backup.emailNote", { email })}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
