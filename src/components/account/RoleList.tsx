import { useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { teamRepository, type TeamRole } from "@/lib/data/teamRepository";
import { useCommand } from "@/lib/useCommand";
import { useT, type MsgKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  areaLevel,
  grantableLevels,
  groupPermissions,
  normalizePerms,
  withLevel,
  type PermArea,
  type PermLevel,
} from "@/lib/permModules";
import { Segmented } from "@/components/ui/segmented";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError } from "@/components/ui/field";

/**
 * Роли во вкладке «Доступ» — списком, как у GitHub (Кирилл 13.11): строка
 * роли раскрывается на месте, без панели сбоку. Внутри — разделы прав с
 * уровнем «нет / чтение / чтение и запись» (Кирилл 14.11), раздел раскрывается до
 * объяснения, что даёт чтение и что добавляет запись. Стандартные роли только
 * показываются, своя правится тут же.
 *
 * Права выдаёт сервер (`teamRepository`): больше своих не дать, владельца не
 * тронуть. Экран заранее не предлагает уровней, которых у человека нет, а отказ
 * сервера показывает под ролью.
 */
export function RoleList({
  roles,
  permissions,
  mine,
  usage,
  onChanged,
}: {
  roles: TeamRole[];
  /** Все права, которые знает сервер. */
  permissions: string[];
  /** Права самого человека: чужих, которых у него нет, он выдать не может. */
  mine: Set<string>;
  /** Сколько людей с ролью: в кабинете и у стола. */
  usage: Record<string, number>;
  onChanged: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold">{t("team.roles")}</h2>
          <p className="max-w-xl text-xs text-muted-foreground">{t("team.rolesLead")}</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setCreating(true);
            setOpen(null);
          }}
        >
          <Plus className="size-3.5" />
          {t("team.newRole")}
        </Button>
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {creating && (
          <li className="py-3">
            <RoleEditor
              item={null}
              permissions={permissions}
              mine={mine}
              onClose={() => setCreating(false)}
              onDone={() => {
                setCreating(false);
                onChanged();
              }}
            />
          </li>
        )}
        {roles.map((r) => {
          const expanded = open === r.id;
          return (
            <li key={r.id}>
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : r.id)}
                className="flex w-full items-center gap-3 py-3 text-left"
              >
                <ChevronRight
                  aria-hidden
                  className={cn(
                    "size-4 shrink-0 text-muted-foreground transition-transform duration-base",
                    expanded && "rotate-90",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="text-sm font-medium">{r.name}</span>
                  {r.builtIn && (
                    <span className="ml-2 text-xs text-muted-foreground">{t("team.builtIn")}</span>
                  )}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {t("team.roleSummary", {
                    perms: r.permissions.length,
                    people: usage[r.id] ?? 0,
                  })}
                </span>
              </button>
              {expanded && (
                <div className="pb-4 pl-7">
                  <RoleEditor
                    item={r}
                    permissions={permissions}
                    mine={mine}
                    onClose={() => setOpen(null)}
                    onDone={() => {
                      setOpen(null);
                      onChanged();
                    }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function RoleEditor({
  item: role,
  permissions,
  mine,
  onClose,
  onDone,
}: {
  item: TeamRole | null;
  permissions: string[];
  mine: Set<string>;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const locked = role?.builtIn ?? false;
  const [name, setName] = useState(role?.name ?? "");
  // Роль из старой версии приводится к уровням сразу: у «делать» есть «смотреть».
  const [perms, setPerms] = useState<Set<string>>(normalizePerms(new Set(role?.permissions ?? [])));
  const save = useCommand(() =>
    teamRepository.saveRole({ id: role?.id, name: name.trim(), permissions: [...perms] }),
  );
  const del = useCommand(() => teamRepository.deleteRole(role?.id ?? ""));
  const groups = groupPermissions(permissions);
  const err = save.error ?? del.error;
  return (
    <div className="flex flex-col gap-5">
      {locked ? (
        <p className="text-xs text-muted-foreground">{t("team.err.defaultRole")}</p>
      ) : (
        <label className="flex max-w-sm flex-col gap-1.5">
          <span className="text-xs font-medium">{t("team.roleName")}</span>
          <Input
            value={name}
            // eslint-disable-next-line jsx-a11y/no-autofocus -- строку раскрыли действием человека
            autoFocus={!role}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      )}
      <div className="flex flex-col divide-y divide-border">
        {groups.areas.map((a) => (
          <PermRow
            key={a.id}
            area={a}
            perms={perms}
            locked={locked}
            mine={mine}
            onPerms={setPerms}
          />
        ))}
        {groups.rest.length > 0 && (
          <div className="flex items-start gap-3 py-3">
            <span className="flex-1 text-sm font-medium">{t("perm.mod.other")}</span>
            <span className="text-xs text-muted-foreground">
              {groups.rest.filter((c) => perms.has(c)).join(", ") || t("perm.level.none")}
            </span>
          </div>
        )}
      </div>
      {err && <FieldError>{t(err)}</FieldError>}
      {!locked && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={!name.trim() || save.pending}
            onClick={async () => {
              if ((await save.run()).ok) onDone();
            }}
          >
            {save.pending ? t("data.busy") : t("common.save")}
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          {role && (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto text-destructive hover:text-destructive"
              disabled={del.pending}
              onClick={async () => {
                if ((await del.run()).ok) onDone();
              }}
            >
              {t("team.deleteRole")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

const LEVEL_KEYS: Record<PermLevel, MsgKey> = {
  none: "perm.level.none",
  read: "perm.level.read",
  write: "perm.level.write",
};

/**
 * Раздел прав (Кирилл 14.11): уровень — нет, чтение или чтение и запись,
 * один на весь раздел. Раскрыв раздел, видно, что даёт чтение и что
 * добавляет запись. У стандартной роли всё только для просмотра.
 */
function PermRow({
  area,
  perms,
  locked,
  mine,
  onPerms,
}: {
  area: PermArea;
  perms: Set<string>;
  locked: boolean;
  mine: Set<string>;
  onPerms: (next: Set<string>) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const level = areaLevel(perms, area);
  // Уровень, которого нет у самого человека, не выдать: сервер откажет. Уже
  // выданный остаётся виден, чтобы не врать, что у роли.
  const levels = grantableLevels(area, mine);
  const options = (["none", "read", "write"] as PermLevel[])
    .filter((v) => (v !== "read" || area.read) && (levels.includes(v) || v === level))
    .map((v) => ({ value: v, label: t(LEVEL_KEYS[v]) }));
  return (
    <div className="py-1">
      <div className="flex flex-wrap items-center gap-3 py-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronRight
            aria-hidden
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform duration-base",
              open && "rotate-90",
            )}
          />
          <span className="text-sm font-medium">{t(area.title)}</span>
        </button>
        {locked ? (
          <span className="shrink-0 text-xs text-muted-foreground">{t(LEVEL_KEYS[level])}</span>
        ) : (
          <Segmented<PermLevel>
            ariaLabel={t(area.title)}
            value={level}
            options={options}
            onChange={(v) => onPerms(withLevel(perms, area, v))}
          />
        )}
      </div>
      {open && (
        <dl className="flex flex-col gap-1.5 pb-2 pl-6 text-xs">
          {area.readDesc && (
            <div className="flex gap-2">
              <dt className="w-32 shrink-0 font-medium">{t("perm.level.read")}</dt>
              <dd className="text-muted-foreground">{t(area.readDesc)}</dd>
            </div>
          )}
          <div className="flex gap-2">
            <dt className="w-32 shrink-0 font-medium">{t("perm.level.write")}</dt>
            <dd className="text-muted-foreground">{t(area.writeDesc)}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
