import { useCallback, useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import {
  teamRepository,
  type TeamMember,
  type TeamRole,
  type TeamState,
} from "@/lib/data/teamRepository";
import { useCommand } from "@/lib/useCommand";
import { useEditor } from "@/lib/store";
import { useT, type MsgKey } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogFooter, DialogHeader, DialogShell } from "@/components/ui/dialog-shell";

/**
 * Вкладка «Доступ» в «Персонале»: кто входит в кабинет и с какой ролью.
 *
 * Только показ и команды серверу (`teamRepository`): роль нельзя дать выше
 * своих прав, себя и владельца не тронуть — это решает сервер, экран лишь
 * переводит его отказ. Окна — панелью справа, без рамок в рамках: строки
 * людей и ролей разделены отступами и заголовками.
 */

const PERM_KEYS: Record<string, MsgKey> = {
  "org.manage": "perm.org.manage",
  "billing.view": "perm.billing.view",
  "staff.manage": "perm.staff.manage",
  "contracts.manage": "perm.contracts.manage",
  "plan.edit": "perm.plan.edit",
  "products.edit": "perm.products.edit",
  "stock.view": "perm.stock.view",
  "stock.move": "perm.stock.move",
  "receiving.do": "perm.receiving.do",
  "picking.do": "perm.picking.do",
  "packing.do": "perm.packing.do",
  "shipping.do": "perm.shipping.do",
  "seller.requests": "perm.seller.requests",
  "chat.use": "perm.chat.use",
  "inventory.count": "perm.inventory.count",
  "inventory.adjust": "perm.inventory.adjust",
};

const STATUS_KEYS: Record<TeamMember["status"], MsgKey> = {
  invited: "team.status.invited",
  active: "team.status.active",
  sleeping: "team.status.sleeping",
  expired: "team.status.expired",
  disabled: "team.status.disabled",
};

const selectClass =
  "flex h-8 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Panel = { kind: "invite" } | { kind: "role"; role: TeamRole | null } | null;

export function TeamAccess() {
  const t = useT();
  const showToast = useEditor((s) => s.showToast);
  const [state, setState] = useState<TeamState | null>(null);
  const [failed, setFailed] = useState<MsgKey | null>(null);
  const [panel, setPanel] = useState<Panel>(null);

  // Перечитать список: счётчик будит эффект, а ответ ложится в состояние из
  // колбэка, а не прямо в теле эффекта.
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  useEffect(() => {
    let alive = true;
    void teamRepository.list().then((res) => {
      if (!alive) return;
      if (res.ok) {
        setState(res.data);
        setFailed(null);
      } else setFailed(res.error === "team.err.forbidden" ? "team.noAccess" : "team.loadFailed");
    });
    return () => {
      alive = false;
    };
  }, [tick]);

  // Правка на месте: роль и отключение — команды строки, отказ — тостом.
  const run = async (op: () => ReturnType<typeof teamRepository.changeRole>) => {
    const res = await op();
    if (!res.ok) showToast(res.error);
    reload();
  };

  if (failed) {
    return <p className="text-sm text-muted-foreground">{t(failed)}</p>;
  }
  if (!state) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;

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
          <Button size="sm" onClick={() => setPanel({ kind: "invite" })}>
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

      <section className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold">{t("team.roles")}</h2>
            <p className="max-w-xl text-xs text-muted-foreground">{t("team.rolesLead")}</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPanel({ kind: "role", role: null })}
          >
            <Plus className="size-3.5" />
            {t("team.newRole")}
          </Button>
        </div>
        <ul className="flex flex-col divide-y divide-border">
          {state.roles.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {r.name}
                  {r.builtIn && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {t("team.builtIn")}
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.permissions.map((p) => (PERM_KEYS[p] ? t(PERM_KEYS[p]) : p)).join(" · ")}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setPanel({ kind: "role", role: r })}>
                {r.builtIn ? t("team.perms") : t("common.edit")}
              </Button>
            </li>
          ))}
        </ul>
      </section>

      {panel?.kind === "invite" && (
        <InvitePanel
          roles={state.roles}
          onClose={() => setPanel(null)}
          onDone={async (email) => {
            setPanel(null);
            showToast("team.sent", { email });
            reload();
          }}
        />
      )}
      {panel?.kind === "role" && (
        <RolePanel
          role={panel.role}
          mine={myPerms}
          permissions={state.permissions.map((p) => p.code)}
          onClose={() => setPanel(null)}
          onDone={async () => {
            setPanel(null);
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
        <select
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
        </select>
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
  const send = useCommand(() => teamRepository.invite(email.trim(), roleId, name.trim()));
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()) && roleId;
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
          <select
            className={selectClass}
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        {send.error && (
          <p role="alert" className="text-xs text-destructive">
            {t(send.error)}
          </p>
        )}
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

function RolePanel({
  role,
  mine,
  permissions,
  onClose,
  onDone,
}: {
  role: TeamRole | null;
  /** Права самого человека: чужих, которых у него нет, он выдать не может. */
  mine: Set<string>;
  permissions: string[];
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const t = useT();
  const locked = role?.builtIn ?? false;
  const [name, setName] = useState(role?.name ?? "");
  const [perms, setPerms] = useState<Set<string>>(new Set(role?.permissions ?? []));
  const save = useCommand(() =>
    teamRepository.saveRole({ id: role?.id, name: name.trim(), permissions: [...perms] }),
  );
  const del = useCommand(() => teamRepository.deleteRole(role?.id ?? ""));
  const done = async (res: { ok: boolean }) => {
    if (res.ok) await onDone();
  };
  const toggle = (code: string) =>
    setPerms((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  const err = save.error ?? del.error;
  return (
    <DialogShell size="md" scroll onClose={onClose}>
      <DialogHeader>
        <p className="text-sm font-semibold">{role ? role.name : t("team.newRole")}</p>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </DialogHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        {locked && <p className="text-xs text-muted-foreground">{t("team.err.defaultRole")}</p>}
        <label className="flex flex-col gap-1.5">
          <Label>{t("team.roleName")}</Label>
          <Input disabled={locked} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <fieldset className="flex flex-col gap-1.5">
          <Label>{t("team.perms")}</Label>
          {permissions.map((code) => {
            // Владельца в свою роль не включают; чужого права, которого нет у
            // самого человека, тоже не выдать (сервер всё равно откажет).
            const allowed = !locked && code !== "org.manage" && mine.has(code);
            return (
              <label key={code} className="flex items-center gap-2 py-0.5 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  disabled={!allowed && !perms.has(code)}
                  checked={perms.has(code)}
                  onChange={() => allowed && toggle(code)}
                />
                <span className={allowed || locked ? "" : "text-muted-foreground"}>
                  {PERM_KEYS[code] ? t(PERM_KEYS[code]) : code}
                </span>
              </label>
            );
          })}
        </fieldset>
        {err && (
          <p role="alert" className="text-xs text-destructive">
            {t(err)}
          </p>
        )}
      </div>
      <DialogFooter spread={Boolean(role && !locked)}>
        {role && !locked && (
          <Button
            variant="ghost"
            size="sm"
            disabled={del.pending}
            onClick={async () => done(await del.run())}
          >
            {t("team.deleteRole")}
          </Button>
        )}
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          {!locked && (
            <Button
              size="sm"
              disabled={!name.trim() || save.pending}
              onClick={async () => done(await save.run())}
            >
              {save.pending ? t("data.busy") : t("common.save")}
            </Button>
          )}
        </div>
      </DialogFooter>
    </DialogShell>
  );
}
