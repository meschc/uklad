import { useState } from "react";
import { Mail, X } from "lucide-react";
import type { StaffMember } from "@/lib/types";
import { staffRepository } from "@/lib/data";
import { teamRepository, type TeamState } from "@/lib/data/teamRepository";
import { useCommand } from "@/lib/useCommand";
import { formatPhone, PHONE_MAX_LENGTH } from "@/lib/phone";
import { draftToMember, formatRate, type PersonDraft } from "@/lib/personDraft";
import { suggestRoleId } from "@/lib/positionRole";
import { asciiAvatar } from "@/lib/asciiAvatar";
import type { TFunc } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { eyebrow } from "@/components/ui/eyebrow";
import { DialogFooter, DialogHeader, DialogShell } from "@/components/ui/dialog-shell";
import { ImagePicker } from "./ImagePicker";
import { RoleField } from "./PersonForm";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Карточка сотрудника — панелью справа (Кирилл 14.11: «при нажатии
 * „Изменить“ должен выезжать сайдбар, чтобы места побольше»). Одна панель на
 * добавление и правку: крупное фото, поля столбиком и, если кабинет на
 * сервере, — доступ: роль (что человек может по бейджу и в кабинете) и
 * приглашение в кабинет по почте.
 *
 * Роль подсказывается по должности (`positionRole.ts`), но выбирает её
 * руководитель. Права решает сервер; отказ остаётся в панели, форма не
 * закрывается.
 */
export function StaffPanel({
  member,
  team,
  onTeamChanged,
  onClose,
  t,
}: {
  /** `null` — новый сотрудник. */
  member: StaffMember | null;
  /** Команда с сервера; в демо `null` — раздела «Доступ» нет. */
  team: TeamState | null;
  onTeamChanged: () => void;
  onClose: () => void;
  t: TFunc;
}) {
  const [form, setForm] = useState<PersonDraft>({
    name: member?.name ?? "",
    role: member?.role ?? "",
    phone: member?.phone ?? "",
    email: member?.email ?? "",
    photoUrl: member?.photoUrl ?? "",
    rate: member?.hourlyRate ? formatRate(String(member.hourlyRate)) : "",
  });
  const current = member ? (team?.deskRoles[member.id] ?? null) : null;
  // Роль выбрали руками — подсказка по должности её больше не меняет.
  const [roleTouched, setRoleTouched] = useState(current != null);
  const [roleId, setRoleId] = useState<string | null>(
    current ?? (team ? suggestRoleId(form.role, team.roles) : null),
  );
  const patch = (p: Partial<PersonDraft>) => {
    setForm((f) => ({ ...f, ...p }));
    if (p.role != null && team && !roleTouched) setRoleId(suggestRoleId(p.role, team.roles));
  };

  const save = useCommand(async () => {
    const fields = draftToMember(form);
    const res = member
      ? await staffRepository.update(member.id, fields)
      : await staffRepository.create(fields);
    if (!res.ok) return res;
    const id = member ? member.id : String(res.data);
    if (team && roleId !== current) {
      const role = await teamRepository.setDeskRole(id, roleId);
      if (!role.ok) return role;
      onTeamChanged();
    }
    return { ok: true as const, data: undefined };
  });

  const email = form.email.trim().toLowerCase();
  const login = team?.members.find((m) => m.email?.toLowerCase() === email);
  const invite = useCommand(() => teamRepository.invite(email, roleId ?? "", form.name.trim()));
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if ((await save.run()).ok) onClose();
  };
  const err = save.error ?? invite.error;

  return (
    <DialogShell size="md" onClose={onClose}>
      <DialogHeader>
        <h2 className="text-sm font-semibold">
          {member ? t("staff.panel.edit") : t("staff.panel.new")}
        </h2>
        <Button variant="ghost" size="icon-sm" aria-label={t("ws.panel.close")} onClick={onClose}>
          <X className="size-4" />
        </Button>
      </DialogHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-4">
        {/* Фото: файлом или ссылкой — рядом, одним выбором (Кирилл 14.11). */}
        <div className="flex flex-col gap-2">
          <ImagePicker
            large
            value={form.photoUrl || undefined}
            fallback={
              <img
                src={asciiAvatar(member?.id ?? "new", "full")}
                alt=""
                className="size-24 shrink-0 rounded-2xl bg-black object-cover"
              />
            }
            onChange={(photoUrl) => patch({ photoUrl: photoUrl ?? "" })}
          />
          <Input
            type="url"
            aria-label={t("staff.photoUrl")}
            // Загруженный файл живёт в поле как data:-адрес — его не показываем.
            value={form.photoUrl.startsWith("data:") ? "" : form.photoUrl}
            onChange={(e) => patch({ photoUrl: e.target.value })}
            placeholder={t("staff.panel.photoOrLink")}
          />
        </div>

        <div className="flex flex-col gap-4">
          <Field label={t("staff.col.name")}>
            <Input
              value={form.name}
              // eslint-disable-next-line jsx-a11y/no-autofocus -- панель открыта действием человека
              autoFocus={!member}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder={t("staff.namePlaceholder")}
            />
          </Field>
          <Field label={t("staff.col.role")}>
            <RoleField value={form.role} onChange={(role) => patch({ role })} t={t} />
          </Field>
          <Field label={t("staff.phone")}>
            <Input
              value={form.phone}
              maxLength={PHONE_MAX_LENGTH}
              onChange={(e) => patch({ phone: formatPhone(e.target.value) })}
              placeholder="+7 495 000-00-00"
              inputMode="tel"
            />
          </Field>
          <Field label={t("staff.email")}>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => patch({ email: e.target.value })}
              placeholder="name@example.ru"
            />
          </Field>
          <Field label={`${t("staff.rate")}, ${t("staff.rateUnit")}`}>
            <Input
              maxLength={10}
              value={form.rate ?? ""}
              onChange={(e) => patch({ rate: formatRate(e.target.value) })}
              inputMode="decimal"
              placeholder={t("staff.panel.ratePlaceholder")}
              className="tabular-nums"
            />
          </Field>
        </div>

        {team && (
          <section className="flex flex-col gap-3">
            <h3 className={eyebrow({ tone: "muted" })}>{t("staff.panel.access")}</h3>
            <Field label={t("team.role")}>
              <Select
                value={roleId ?? ""}
                onChange={(e) => {
                  setRoleTouched(true);
                  setRoleId(e.target.value || null);
                }}
              >
                <option value="">{t("team.deskNone")}</option>
                {team.roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
            <p className="text-xs text-muted-foreground">{t("staff.panel.roleHint")}</p>
            {/* Вход в кабинет — приглашением на почту: человек сам задаёт
                пароль по ссылке (`team.js`, `InviteAccept`). */}
            {login ? (
              <p className="text-sm">{t("staff.panel.hasLogin", { role: login.roleName })}</p>
            ) : sent ? (
              <p className="text-sm">{t("team.sent", { email })}</p>
            ) : (
              <div className="flex flex-col items-start gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!EMAIL_RE.test(email) || !roleId || invite.pending}
                  onClick={async () => {
                    if ((await invite.run()).ok) {
                      setSent(true);
                      onTeamChanged();
                    }
                  }}
                >
                  <Mail className="size-3.5" />
                  {invite.pending ? t("data.busy") : t("staff.panel.invite")}
                </Button>
                <p className="text-xs text-muted-foreground">{t("staff.panel.inviteHint")}</p>
              </div>
            )}
          </section>
        )}

        {err && (
          <p role="alert" className="text-xs text-destructive">
            {t(err)}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button variant="ghost" size="sm" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button size="sm" disabled={!form.name.trim() || save.pending} onClick={submit}>
          {save.pending ? t("data.busy") : save.error ? t("data.retry") : t("common.save")}
        </Button>
      </DialogFooter>
    </DialogShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </label>
  );
}
