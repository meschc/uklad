import { useState } from "react";
import { isEmail } from "@/lib/validate";
import { Plus, X } from "lucide-react";
import { teamRepository, type TeamMember, type TeamRole } from "@/lib/data/teamRepository";
import { useCommand } from "@/lib/useCommand";
import { useEditor } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogFooter, DialogHeader, DialogShell } from "@/components/ui/dialog-shell";
import { selectClass, STATUS_KEYS } from "./teamSelect";
import { RoleList } from "./RoleList";
import { useTeam } from "./useTeam";
import { Select } from "@/components/ui/select";
import { FieldError } from "@/components/ui/field";
import { TableScroll, TABLE_HEAD, TABLE_HEAD_ROW, TABLE_ROW } from "@/components/ui/table-scroll";

/**
 * Вкладка «Доступ» в «Персонале»: кто входит в кабинет и с какой ролью.
 *
 * Только показ и команды серверу (`teamRepository`): роль нельзя дать выше
 * своих прав, себя и владельца не тронуть — это решает сервер, экран лишь
 * переводит его отказ. Окна — панелью справа, без рамок в рамках: строки
 * людей и ролей разделены отступами и заголовками.
 */

/**
 * Роль сотрудника у стола теперь в таблице сотрудников (колонка «Роль»),
 * здесь — вход в кабинет и сами роли.
 */
export function TeamAccess() {
  const t = useT();
  const notify = useEditor((s) => s.notify);
  const { state, failed, reload } = useTeam();
  const warehouseId = useEditor((s) => s.warehouse.id);
  const staff = useEditor((s) => s.warehouse.staff);
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

  // Кто держит роль — в кабинете и у стола этого склада: «занята кем», а не
  // число по всей компании (Кирилл 22.11).
  const holders: Record<string, string[]> = {};
  const hold = (roleId: string, who: string) => (holders[roleId] ??= []).push(who);
  for (const m of state.members) hold(m.roleId, m.name || m.email || "—");
  for (const s of staff ?? []) {
    const roleId = state.deskRoles[s.id];
    if (roleId) hold(roleId, s.name || s.id);
  }
  const myPerms = new Set(state.myPermissions);
  // Владельцу сервер отдаёт роли всех складов: здесь — только этого склада и
  // роли компании. Иначе на складе Б видны и правятся роли склада А (058).
  const roles = state.roles.filter((r) => !r.warehouseRef || r.warehouseRef === warehouseId);
  // Люди открытого склада и владелец; кто ни к одному складу не закреплён —
  // отдельно, чтобы его не принимали за человека этого склада (Кирилл 22.11).
  const row = (m: TeamMember) => (
    <MemberRow
      key={m.id}
      m={m}
      me={state.me}
      roles={roles}
      onRole={(roleId) => run(() => teamRepository.changeRole(m.id, roleId))}
      onDisable={(off) => run(() => teamRepository.setDisabled(m.id, off))}
      onRevoke={() => run(() => teamRepository.revokeInvite(m.id))}
    />
  );
  const owner = (m: TeamMember) => state.ownerRoles.includes(m.roleId);
  const here = state.members.filter((m) => m.warehouseRef === warehouseId || owner(m));
  const unplaced = state.members.filter((m) => !m.warehouseRef && !owner(m));

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
        <MemberTable>{here.map(row)}</MemberTable>
      </section>

      {unplaced.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold">{t("team.unplaced")}</h2>
            <p className="max-w-xl text-xs text-muted-foreground">{t("team.unplacedLead")}</p>
          </div>
          <MemberTable>{unplaced.map(row)}</MemberTable>
        </section>
      )}

      <RoleList
        roles={roles}
        permissions={state.permissions.map((p) => p.code)}
        mine={myPerms}
        holders={holders}
        warehouseRef={warehouseId}
        onChanged={reload}
      />

      {inviting && (
        <InvitePanel
          roles={roles}
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

/** Люди с входом — таблицей по ширине содержимого (Кирилл 24.11). */
function MemberTable({ children }: { children: React.ReactNode }) {
  const t = useT();
  return (
    <TableScroll>
      <table className="table-stack w-auto border-collapse text-sm">
        <thead className={TABLE_HEAD}>
          <tr className={TABLE_HEAD_ROW}>
            <th className="px-3 py-2 font-normal">{t("team.col.name")}</th>
            <th className="px-3 py-2 font-normal">{t("team.col.email")}</th>
            <th className="px-3 py-2 font-normal">{t("team.col.status")}</th>
            <th className="px-3 py-2 font-normal">{t("team.role")}</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </TableScroll>
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
  // Роли владельца в списке нет (её не дать): у него — подпись, а не выбор.
  const fixed = !roles.some((r) => r.id === m.roleId);
  const until = m.inviteExpiresAt
    ? new Date(m.inviteExpiresAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
    : null;
  return (
    <tr className={TABLE_ROW}>
      <td className="px-3 py-2">
        <span className="font-medium">{m.name || m.email || "—"}</span>
        {mine && <span className="ml-2 text-xs text-muted-foreground">{t("team.you")}</span>}
      </td>
      <td className="px-3 py-2" data-label={t("team.col.email")}>
        {m.name ? m.email : null}
      </td>
      <td className="px-3 py-2 text-muted-foreground" data-label={t("team.col.status")}>
        {[
          t(STATUS_KEYS[m.status]),
          pending && until ? t("team.invitedUntil", { date: until }) : null,
          !m.hasLogin && !pending ? t("team.noLogin") : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </td>
      <td className="px-3 py-2" data-label={t("team.role")}>
        {fixed ? (
          <span>{m.roleName}</span>
        ) : (
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
        )}
      </td>
      <td className="px-3 py-2">
        {pending ? (
          <Button size="sm" variant="ghost" onClick={onRevoke}>
            {t("team.revoke")}
          </Button>
        ) : (
          !mine &&
          !fixed && (
            <Button
              size="sm"
              variant="ghost"
              className={
                m.status === "disabled"
                  ? undefined
                  : "text-destructive hover:bg-destructive/10 hover:text-destructive"
              }
              onClick={() => onDisable(m.status !== "disabled")}
            >
              {m.status === "disabled" ? t("team.enable") : t("team.disable")}
            </Button>
          )
        )}
      </td>
    </tr>
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
    roles.find((r) => r.builtIn && r.name === "Кладовщик / оператор")?.id ?? roles[0]?.id ?? "",
  );
  // Без карточки — на склад, открытый сейчас: кабинет человеку покажется
  // только по нему (миграция 034).
  const warehouseRef = useEditor((s) => s.warehouse.id);
  const send = useCommand(
    () => teamRepository.invite(email.trim(), roleId, name.trim(), { warehouseRef }),
    { exclusive: true },
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
