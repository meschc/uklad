import { useState } from "react";
import { Landmark } from "lucide-react";
import { useEditor } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { checkBankAccount, checkBik } from "@/lib/validate";
import { companyRepository } from "@/lib/data/companyRepository";
import { Input } from "@/components/ui/input";
import { Row, ReadValue, RowEditor } from "./ProfileRow";

/**
 * Банк компании — для счёта продавцу. Человек вводит БИК и расчётный счёт,
 * название банка и корсчёт приходят из справочника (DaData через сервер,
 * ключ в браузер не уходит). Как у ИНН: введённое сохраняется сразу,
 * справочник догоняет — не ответил, но БИК и счёт не теряются.
 *
 * Счёт сверяется с БИК контрольным ключом ЦБ: опечатка в одной цифре
 * ловится здесь, а не в банке продавца, который не смог заплатить.
 */
export function BankRow() {
  const t = useT();
  const account = useEditor((s) => s.account);
  const updateAccount = useEditor((s) => s.updateAccount);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ bik: "", bankAccount: "" });
  const [note, setNote] = useState<{ text: string; warn?: boolean } | null>(null);

  const bikErr = checkBik(draft.bik);
  const err = bikErr ?? checkBankAccount(draft.bankAccount, draft.bik);

  const open = () => {
    setDraft({ bik: account.bik ?? "", bankAccount: account.bankAccount ?? "" });
    setNote(null);
    setEditing(true);
  };

  const save = () => {
    if (err) return;
    const bik = draft.bik.trim();
    const sameBik = bik === (account.bik ?? "");
    updateAccount({
      bik: bik || undefined,
      bankAccount: draft.bankAccount.trim() || undefined,
      // Новый БИК — прежний банк уже не про него.
      ...(sameBik ? {} : { bankName: undefined, correspondentAccount: undefined }),
    });
    setEditing(false);
    if (!bik || (sameBik && account.bankName)) return;
    setNote({ text: t("profile.bankFetching") });
    void companyRepository.bank(bik).then((res) => {
      // Пока ждали, БИК успели поменять — этот ответ уже не о нём.
      if (useEditor.getState().account.bik !== bik) return;
      if (!res.ok) return setNote({ text: t(res.error) });
      const bank = res.data;
      if (!bank) return setNote({ text: t("profile.bankNotFound"), warn: true });
      updateAccount({ bankName: bank.name, correspondentAccount: bank.correspondentAccount });
      if (bank.mock) return setNote({ text: t("profile.bankMock") });
      const inactive = bank.status && bank.status !== "ACTIVE";
      setNote(inactive ? { text: t("profile.bankInactive"), warn: true } : null);
    });
  };

  const lines: [string, string | undefined, boolean][] = [
    [t("profile.bank"), account.bankName, false],
    [t("profile.bik"), account.bik, true],
    [t("profile.correspondentAccount"), account.correspondentAccount, true],
    [t("profile.bankAccount"), account.bankAccount, true],
  ];
  const shown = lines.filter(([, v]) => v);

  return (
    <Row icon={<Landmark className="size-4" />} label={t("profile.bank")}>
      {editing ? (
        <RowEditor
          onSave={save}
          onCancel={() => setEditing(false)}
          canSave={!err}
          hint={err ? { text: t(err), error: true } : { text: t("profile.bankHint") }}
        >
          <div className="flex w-full flex-col gap-1.5">
            <Input
              // eslint-disable-next-line jsx-a11y/no-autofocus -- строчный редактор открыт по клику «изменить»: фокус обязан уйти в поле
              autoFocus
              value={draft.bik}
              inputMode="numeric"
              maxLength={9}
              onChange={(e) => setDraft({ ...draft, bik: e.target.value.replace(/\D/g, "") })}
              placeholder={t("profile.bik")}
              aria-invalid={!!bikErr || undefined}
              className="h-9 font-mono"
            />
            <Input
              value={draft.bankAccount}
              inputMode="numeric"
              maxLength={20}
              onChange={(e) =>
                setDraft({ ...draft, bankAccount: e.target.value.replace(/\D/g, "") })
              }
              placeholder={t("profile.bankAccount")}
              aria-invalid={(!bikErr && !!err) || undefined}
              className="h-9 font-mono"
            />
          </div>
        </RowEditor>
      ) : (
        <div className="flex flex-col gap-1">
          <ReadValue onEdit={open}>
            {shown.length ? (
              <dl className="grid max-w-sm grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
                {shown.map(([label, value, mono]) => (
                  <div key={label} className="contents">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className={mono ? "font-mono text-xs leading-5" : undefined}>{value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )}
          </ReadValue>
          {note && (
            <span className={note.warn ? "text-xs warn-chip" : "text-xs text-muted-foreground"}>
              {note.text}
            </span>
          )}
        </div>
      )}
    </Row>
  );
}
