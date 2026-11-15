import { useState } from "react";
import { KeyRound, Mail } from "lucide-react";
import type { Partner } from "@/lib/types";
import { teamRepository } from "@/lib/data/teamRepository";
import { flushServerSync } from "@/lib/store/serverSync";
import { useCommand } from "@/lib/useCommand";
import { useEditor } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { isEmail } from "@/lib/validate";
import { Button } from "@/components/ui/button";
import { Field, FormError } from "@/components/ui/field";
import { EmailInput } from "./EmailInput";
import { STATUS_KEYS } from "./teamSelect";
import { useTeam } from "./useTeam";

/**
 * Кабинет продавца из карточки партнёра (миграция 038): склад зовёт продавца
 * по почте, тот входит и видит только товар этого партнёра — остатки, адреса,
 * приёмку и отгрузки по нему. Чужой товар сервер ему не отдаёт вовсе.
 *
 * Только на сервере и только тому, кто ведёт персонал: в демо продавец
 * входит переключателем роли, звать некого.
 */
export function PartnerInvite({ partner }: { partner: Partner }) {
  const onServer = useEditor((s) => s.session.source === "server");
  if (!onServer) return null;
  return <Invite partner={partner} />;
}

function Invite({ partner }: { partner: Partner }) {
  const t = useT();
  const warehouseRef = useEditor((s) => s.warehouse.id);
  const notify = useEditor((s) => s.notify);
  const { state, failed, reload } = useTeam();
  const [email, setEmail] = useState(isEmail(partner.contact ?? "") ? partner.contact! : "");
  const send = useCommand(async () => {
    // Новый партнёр мог ещё не доехать до сервера: сервер сверяет продавца
    // со своим снимком склада.
    await flushServerSync();
    return teamRepository.inviteSeller(email.trim(), partner.person || partner.name, {
      warehouseRef,
      partnerRef: partner.id,
    });
  });
  // Нет права на персонал — блока нет: звать продавца ему не дано.
  if (failed || !state) return null;
  const invited = state.sellers.filter((m) => m.partnerRef === partner.id);

  const submit = async () => {
    const res = await send.run();
    if (!res.ok) return;
    notify("success", "partners.invite.sent", { vars: { email: email.trim() } });
    reload();
  };

  return (
    <div className="flex flex-col gap-2">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <KeyRound className="size-4 text-muted-foreground" />
        {t("partners.invite.title")}
      </h3>
      <p className="text-xs text-muted-foreground">{t("partners.invite.lead")}</p>
      {invited.length > 0 && (
        <ul className="flex flex-col divide-y divide-border/60 text-sm">
          {invited.map((m) => (
            <li key={m.id} className="flex items-baseline justify-between gap-3 py-1.5">
              <span className="min-w-0 truncate">{m.email ?? m.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {t(STATUS_KEYS[m.status])}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2">
        <Field label={t("partners.invite.email")} className="min-w-0 flex-1">
          <EmailInput value={email} onValueChange={setEmail} />
        </Field>
        <Button
          variant="outline"
          onClick={() => void submit()}
          disabled={!isEmail(email.trim()) || send.pending}
        >
          <Mail className="size-4" />
          {invited.length > 0 ? t("partners.invite.again") : t("partners.invite.send")}
        </Button>
      </div>
      {send.error && <FormError>{t(send.error)}</FormError>}
    </div>
  );
}
