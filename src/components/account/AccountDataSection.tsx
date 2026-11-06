import { useEffect, useState } from "react";
import { Download, MonitorSmartphone, Trash2 } from "lucide-react";
import { accountRepository, type AccountInfo } from "@/lib/data/accountRepository";
import { leaveServerSession } from "@/lib/store/leave";
import { useCommand } from "@/lib/useCommand";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { card } from "@/components/ui/card";
import { Row } from "./ProfileRow";
import { Section } from "./ProfileParts";
import { downloadBackup } from "./backupDownload";

/**
 * «Безопасность и данные» — то, что человек ищет в профиле любого сервиса,
 * а у нас не было (Кирилл 1 ноя: «почему не могу удалить профиль?»).
 *
 * Три строки, как у Google, Notion и Telegram:
 * - выйти на других устройствах — забыл выйти на складском компьютере;
 * - скачать свои данные — тот же архив, что резервная копия;
 * - удалить аккаунт — паролем и со сроком 30 дней на отмену. Пароль, а не
 *   кнопка: сессию на чужом компьютере может открыть кто угодно. Срок, а не
 *   мгновенно: удаление стирает компанию вместе с работой склада, и ошибку
 *   надо успеть исправить. Подтверждение раскрывается строкой на месте, без
 *   окна поверх экрана.
 *
 * Только в сборке с сервером: в демо всё живёт в браузере, и «удалить» там —
 * это «Демо-данные → Загрузить заново».
 */
export function AccountDataSection() {
  const t = useT();
  const [info, setInfo] = useState<AccountInfo | null>(null);
  const [closed, setClosed] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [password, setPassword] = useState("");

  useEffect(() => {
    void accountRepository.info().then((res) => {
      if (res.ok) setInfo(res.data);
    });
  }, []);

  const revoke = useCommand(accountRepository.revokeOthers);
  const remove = useCommand(accountRepository.remove);

  const onRevoke = async () => {
    const res = await revoke.run();
    if (!res.ok) return;
    setClosed(res.data);
    setInfo((i) => (i ? { ...i, otherSessions: 0 } : i));
  };

  const onRemove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    const res = await remove.run(password);
    // Сервер уже погасил все сессии: копия кабинета на этом компьютере
    // больше ничья, стираем её и открываем вход с напоминанием про 30 дней.
    if (res.ok) leaveServerSession("deleted");
  };

  const others = info?.otherSessions ?? 0;

  return (
    <Section title={t("account.section")}>
      <div
        className={card({
          pad: "none",
          className: "flex flex-col divide-y divide-border overflow-hidden",
        })}
      >
        <Row icon={<MonitorSmartphone className="size-4" />} label={t("account.devices")}>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-3">
            <span className="text-sm text-muted-foreground">
              {revoke.error
                ? t(revoke.error)
                : closed !== null
                  ? t("account.devicesClosed", { n: closed })
                  : others > 0
                    ? t("account.devicesOther", { n: others })
                    : t("account.devicesNone")}
            </span>
            {others > 0 && (
              <Button size="sm" variant="outline" disabled={revoke.pending} onClick={onRevoke}>
                {t("account.devicesRevoke")}
              </Button>
            )}
          </div>
        </Row>

        <Row icon={<Download className="size-4" />} label={t("account.export")}>
          <Button size="sm" variant="outline" onClick={() => void downloadBackup()}>
            {t("account.exportButton")}
          </Button>
        </Row>

        <Row icon={<Trash2 className="size-4" />} label={t("account.delete")}>
          {!confirm && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirm(true)}
            >
              {t("account.deleteOpen")}
            </Button>
          )}
        </Row>

        {confirm && (
          <form onSubmit={onRemove} className="flex flex-col gap-3 px-4 py-4">
            <p className="text-sm">{t("account.deleteWhat")}</p>
            <p className="text-sm text-muted-foreground">{t("account.deleteGrace")}</p>
            <Input
              // eslint-disable-next-line jsx-a11y/no-autofocus -- подтверждение открыто кнопкой «Удалить»: фокус обязан уйти в пароль
              autoFocus
              type="password"
              autoComplete="current-password"
              aria-label={t("account.deletePassword")}
              placeholder={t("account.deletePassword")}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                remove.reset();
              }}
              className="h-9 sm:max-w-xs"
            />
            {remove.error && <p className="text-sm text-destructive">{t(remove.error)}</p>}
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                size="sm"
                variant="destructive"
                disabled={!password || remove.pending}
              >
                {t("account.deleteConfirm")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setConfirm(false);
                  setPassword("");
                  remove.reset();
                }}
              >
                {t("common.cancel")}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Section>
  );
}
