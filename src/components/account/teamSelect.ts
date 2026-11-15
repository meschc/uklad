import type { TeamMember } from "@/lib/data/teamRepository";
import type { MsgKey } from "@/lib/i18n";

/** Выпадающий список вкладки «Доступ» — высота 32, как у контролов `sm`. */
export const selectClass =
  "flex h-8 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Подпись состояния входа человека: приглашён, работает, отключён… */
export const STATUS_KEYS: Record<TeamMember["status"], MsgKey> = {
  invited: "team.status.invited",
  active: "team.status.active",
  sleeping: "team.status.sleeping",
  expired: "team.status.expired",
  disabled: "team.status.disabled",
};
