import { useState } from "react";
import { isEmail } from "@/lib/validate";
import { Plus, X } from "lucide-react";
import { teamRepository, type TeamMember, type TeamRole } from "@/lib/data/teamRepository";
import { useCommand } from "@/lib/useCommand";
import { useEditor } from "@/lib/store";
import { useT, type MsgKey } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogFooter, DialogHeader, DialogShell } from "@/components/ui/dialog-shell";
import { selectClass } from "./teamSelect";
import { RoleList } from "./RoleList";
import { useTeam } from "./useTeam";
import { Select } from "@/components/ui/select";
import { FieldError } from "@/components/ui/field";

/**
 * Вкладка «Доступ» в «Персонале»: кто входит в кабинет и с какой ролью.
 *
 * Только показ и команды серверу (`teamRepository`): роль нельзя дать выше
 * своих прав, себя и владельца не тронуть — это решает сервер, экран лишь
 * переводит его отказ. Окна — панелью справа, без рамок в рамках: строки
 * людей и ролей разделены отступами и заголовками.
 */

const STATUS_KEYS: Record<TeamMember["status"], MsgKey> = {
  invited: "team.status.invited",
  active: "team.status.active",
  sleeping: "team.status.sleeping",
  expired: "team.status.expired",
  disabled: "team.status.disabled",
};

/**
 * Роль сотрудника у стола теперь в таблице сотрудников (колонка «Роль»),
 * здесь — вход в кабинет и сами роли.
 */
export function TeamAccess() {
  const t = useT();
  const notify = useEditor((s) => s.notify);
  const { state, failed, reload } = useTeam();
  const [inviting, setInviting] = useState(false);

  // Правка на месте: роль и отключение — команды строки, отказ — тостом.
  const run = async (op: () => ReturnType<typeof teamRepository.setDisabled>) => {
    const res = await op();
    if (!res.ok) notify("error", res.error);
    reload();
  };

  if (failed) {
    return <p className="text-sm text-muted-foreground">{t(failed)}</p>;
  }
  if (!state) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;

  // Сколько людей с ролью — в кабинете и у стола.
  const usage: Record<string, number> = {};
  for (const id of [...state.members.map((m) => m.roleId), ...Object.values(state.deskRoles)])
    usage[id] = (usage[id] ?? 0) + 1;
  const myPerms = new Set(
    state.roles.find((r) => r.id === state.members.find((m) => m.id === state.me)?.roleId)
      ?.permissions,
  );

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold">{t("team.title")}</h2>
            <p className="max-w-xl text-xs text-muted-foreground">{t("team.lead")}</p>
          </div>
          <Button size="sm" onClick={() => setInviting(true)}>
            <Plus className="size-3.5" />
            {t("team.invite")}
          </Button>
        </div>
        <ul className="flex flex-col divide-y divide-border">
          {state.members.map((m) => (
            <MemberRow
              key={m.id}
              m={m}
              me={state.me}
              roles={state.roles}
              onRole={(roleId) => run(() => teamRepository.changeRole(m.id, roleId))}
              onDisable={(off) => run(() => teamRepository.setDisabled(m.id, off))}
              onRevoke={() => run(() => teamRepository.revokeInvite(m.id))}
            />
          ))}
        </ul>
      </section>

      <RoleList
        roles={state.roles}
        permissions={state.permissions.map((p) => p.code)}
        mine={myPerms}
        usage={usage}
        onChanged={reload}
      />

      {inviting && (
        <InvitePanel
          roles={state.roles}
          onClose={() => setInviting(false)}
          onDone={async (email) => {
            setInviting(false);
            notify("success", "team.sent", { vars: { email } });
            reload();
          }}
        />
      )}
    </div>
  );
}

function MemberRow({
  m,
  me,
  roles,
  onRole,
  onDisable,
  onRevoke,
}: {
  m: TeamMember;
  me: string;
  roles: TeamRole[];
  onRole: (roleId: string) => void;
  onDisable: (off: boolean) => void;
  onRevoke: () => void;
}) {
  const t = useT();
  const mine = m.id === me;
  const pending = m.status === "invited" && !m.hasLogin;
  const until = m.inviteExpiresAt
    ? new Date(m.inviteExpiresAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
    : null;
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {m.name || m.email || "—"}
          {mine && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">{t("team.you")}</span>
          )}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {[
            m.name ? m.email : null,
            t(STATUS_KEYS[m.status]),
            pending && until ? t("team.invitedUntil", { date: until }) : null,
            !m.hasLogin && !pending ? t("team.noLogin") : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Select
          aria-label={t("team.role")}
          className={`${selectClass} w-44`}
          value={m.roleId}
          disabled={mine || pending}
          onChange={(e) => onRole(e.target.value)}
        >
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
        {pending ? (
          <Button size="sm" variant="ghost" onClick={onRevoke}>
            {t("team.revoke")}
          </Button>
        ) : (
          !mine && (
            <Button size="sm" variant="ghost" onClick={() => onDisable(m.status !== "disabled")}>
              {m.status === "disabled" ? t("team.enable") : t("team.disable")}
            </Button>
          )
        )}
      </div>
    </li>
  );
}

function InvitePanel({
  roles,
  onClose,
  onDone,
}: {
  roles: TeamRole[];
  onClose: () => void;
  onDone: (email: string) => void | Promise<void>;
}) {
  const t = useT();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState(
    roles.find((r) => r.name === "Кладовщик")?.id ?? roles[0]?.id ?? "",
  );
  // Без карточки — на склад, открытый сейчас: кабинет человеку покажется
  // только по нему (миграция 034).
  const warehouseRef = useEditor((s) => s.warehouse.id);
  const send = useCommand(() =>
    teamRepository.invite(email.trim(), roleId, name.trim(), { warehouseRef }),
  );
  const valid = isEmail(email) && roleId;
  const submit = async () => {
    const res = await send.run();
    if (res.ok) await onDone(email.trim());
  };
  return (
    <DialogShell size="md" onClose={onClose}>
      <DialogHeader>
        <p className="text-sm font-semibold">{t("team.inviteTitle")}</p>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </DialogHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        <p className="text-xs text-muted-foreground">{t("team.inviteHint")}</p>
        <label className="flex flex-col gap-1.5">
          <Label>{t("team.email")}</Label>
          <Input
            type="email"
            value={email}
            // eslint-disable-next-line jsx-a11y/no-autofocus -- панель открыта действием человека
            autoFocus
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <Label>
            {t("team.name")} · {t("common.optional")}
          </Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <Label>{t("team.role")}</Label>
          <Select
            className={selectClass}
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </label>
        {send.error && <FieldError>{t(send.error)}</FieldError>}
      </div>
      <DialogFooter>
        <Button variant="ghost" size="sm" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button size="sm" disabled={!valid || send.pending} onClick={submit}>
          {send.pending ? t("data.busy") : t("team.send")}
        </Button>
      </DialogFooter>
    </DialogShell>
  );
}
