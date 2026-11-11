import type { MsgKey } from "../i18n";
import { apiRequest, type ApiResponse } from "./api";
import { attempt, fail, ok, type Result } from "./result";

/**
 * Команда компании на сервере (`server/api/src/cabinet/team.js`): люди,
 * приглашения, роли. Права решает сервер — роль нельзя дать выше своих прав,
 * себя и владельца не тронуть, — здесь только перевод отказов на язык
 * интерфейса. Экран ничего из этих правил не дублирует: иначе две копии
 * разъедутся, а верна только серверная.
 */

export interface TeamMember {
  id: string;
  name: string | null;
  email: string | null;
  roleId: string;
  roleName: string;
  status: "invited" | "active" | "sleeping" | "expired" | "disabled";
  hasLogin: boolean;
  hasBadge: boolean;
  lastSeenAt: string | null;
  inviteExpiresAt: string | null;
}

export interface TeamRole {
  id: string;
  name: string;
  permissions: string[];
  /** Роль по умолчанию: переименовать нельзя, права не правятся. */
  builtIn: boolean;
}

interface TeamPermission {
  code: string;
  title: string;
}

export interface TeamState {
  me: string;
  members: TeamMember[];
  roles: TeamRole[];
  permissions: TeamPermission[];
  /** Роли сотрудников стола (вход по бейджу): `staffRef → roleId`. */
  deskRoles: Record<string, string>;
}

/** Что показать человеку, когда сервер отказал. */
function teamError(res: ApiResponse): MsgKey {
  if (res.status === 429) return "team.err.tooOften";
  switch (res.body.error) {
    case "role_not_allowed":
      return "team.err.roleNotAllowed";
    case "self":
      return "team.err.self";
    case "default_role":
      return "team.err.defaultRole";
    case "already_member":
      return "team.err.alreadyMember";
    case "role_in_use":
      return "team.err.roleInUse";
    case "too_many_invites":
      return "team.err.tooManyInvites";
    case "not_found":
      return "team.err.notFound";
    case "bad_name":
    case "bad_request":
      return "team.err.badInput";
    default:
      return res.status === 403 ? "team.err.forbidden" : "data.failed";
  }
}

async function act(path: string, body: Record<string, unknown>): Promise<Result<void>> {
  const res = await attempt(() => apiRequest("POST", path, body));
  if (!res.ok) return res;
  return res.data.status === 200 ? ok(undefined) : fail(teamError(res.data));
}

export const teamRepository = {
  list: async (): Promise<Result<TeamState>> => {
    const res = await attempt(() => apiRequest("GET", "/team"));
    if (!res.ok) return res;
    const { status, body } = res.data;
    if (status !== 200 || !Array.isArray(body.members)) return fail(teamError(res.data));
    const state = body as unknown as TeamState;
    return ok({ ...state, deskRoles: state.deskRoles ?? {} });
  },
  invite: (email: string, roleId: string, name: string) =>
    act("/team/invite", { email, roleId, name }),
  revokeInvite: (memberId: string) => act("/team/invite/revoke", { memberId }),
  changeRole: (memberId: string, roleId: string) => act("/team/role", { memberId, roleId }),
  setDisabled: (memberId: string, disabled: boolean) =>
    act("/team/disable", { memberId, disabled }),
  saveRole: (role: { id?: string; name: string; permissions: string[] }) =>
    act("/team/roles/save", {
      ...(role.id ? { roleId: role.id } : {}),
      name: role.name,
      permissions: role.permissions,
    }),
  deleteRole: (roleId: string) => act("/team/roles/delete", { roleId }),
  /** Роль сотрудника стола; `null` — снять. */
  setDeskRole: (staffRef: string, roleId: string | null) =>
    act("/team/desk-role", { staffRef, roleId }),
};

/** Приглашение по ссылке из письма: что в нём и принять. */
export interface InviteInfo {
  company: string;
  role: string;
  email: string;
  /** У почты уже есть кабинет: нужен её пароль, а не новый. */
  hasAccount: boolean;
}

export const inviteRepository = {
  info: async (token: string): Promise<Result<InviteInfo | null>> => {
    const res = await attempt(() => apiRequest("POST", "/auth/invite/info", { token }));
    if (!res.ok) return res;
    const { status, body } = res.data;
    if (status === 404) return ok(null);
    if (status !== 200) return fail(teamError(res.data));
    return ok(body as unknown as InviteInfo);
  },
  accept: async (token: string, password: string, consent: boolean): Promise<Result<void>> => {
    const res = await attempt(() =>
      apiRequest("POST", "/auth/invite/accept", { token, password, consent }),
    );
    if (!res.ok) return res;
    const { status, body } = res.data;
    if (status === 200) return ok(undefined);
    if (status === 401) return fail("login.err.badCredentials");
    if (status === 404) return fail("team.invite.gone");
    if (body.error === "weak_password") return fail("login.err.weakPassword");
    if (status === 429) return fail("login.err.locked");
    return fail(teamError(res.data));
  },
};
