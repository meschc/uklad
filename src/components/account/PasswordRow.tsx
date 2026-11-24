import { useState } from "react";
import { KeyRound } from "lucide-react";
import { accountRepository } from "@/lib/data/accountRepository";
import { useCommand } from "@/lib/useCommand";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormError } from "@/components/ui/field";
import { Row } from "./ProfileRow";

/**
 * Смена пароля (Кирилл 24.11): у каждого, кто входит по почте, — владельца,
 * начальника склада, продавца. Старый пароль обязателен: вкладку могли
 * оставить открытой. Форма раскрывается строкой на месте, без окна поверх.
 * После смены другие устройства выходят (`onChanged`), эта остаётся.
 */
export function PasswordRow({ onChanged }: { onChanged: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [done, setDone] = useState(false);
  const change = useCommand(accountRepository.changePassword, { exclusive: true });

  const close = () => {
    setOpen(false);
    setCurrent("");
    setNext("");
    change.reset();
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!current || !next) return;
    const res = await change.run(current, next);
    if (!res.ok) return;
    close();
    setDone(true);
    onChanged();
  };

  return (
    <>
      <Row icon={<KeyRound className="size-4" />} label={t("account.password")}>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-3">
          {done && (
            <span className="text-sm text-muted-foreground">{t("account.passwordDone")}</span>
          )}
          {!open && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDone(false);
                setOpen(true);
              }}
            >
              {t("account.passwordOpen")}
            </Button>
          )}
        </div>
      </Row>
      {open && (
        <form onSubmit={onSubmit} className="flex flex-col gap-3 px-4 py-4">
          <Input
            // eslint-disable-next-line jsx-a11y/no-autofocus -- форма открыта кнопкой «Сменить»: фокус обязан уйти в пароль
            autoFocus
            type="password"
            autoComplete="current-password"
            aria-label={t("account.passwordCurrent")}
            placeholder={t("account.passwordCurrent")}
            value={current}
            onChange={(e) => {
              setCurrent(e.target.value);
              change.reset();
            }}
            className="h-9 sm:max-w-xs"
          />
          <Input
            type="password"
            autoComplete="new-password"
            aria-label={t("account.passwordNext")}
            placeholder={t("account.passwordNext")}
            value={next}
            onChange={(e) => {
              setNext(e.target.value);
              change.reset();
            }}
            className="h-9 sm:max-w-xs"
          />
          {change.error && <FormError>{t(change.error)}</FormError>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={!current || !next || change.pending}>
              {t("account.passwordSave")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={close}>
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      )}
    </>
  );
}
