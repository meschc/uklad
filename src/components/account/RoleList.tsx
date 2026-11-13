import { useState } from "react";
import { Check, ChevronRight, Minus, Plus } from "lucide-react";
import { teamRepository, type TeamRole } from "@/lib/data/teamRepository";
import { useCommand } from "@/lib/useCommand";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { PERM_DESC, PERM_KEYS, groupPermissions } from "@/lib/permModules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { eyebrow } from "@/components/ui/eyebrow";

/**
 * Роли во вкладке «Доступ» — списком, как у GitHub (Кирилл 13.11): строка
 * роли раскрывается на месте, без панели сбоку. Внутри — разделы прав, у
 * каждого права одна строка: что оно даёт. Стандартные роли только
 * показываются, своя роль правится тут же.
 *
 * Права выдаёт сервер (`teamRepository`): больше своих не дать, владельца не
 * тронуть. Экран заранее гасит галочки, которых у человека нет, а отказ
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
  const [perms, setPerms] = useState<Set<string>>(new Set(role?.permissions ?? []));
  const save = useCommand(() =>
    teamRepository.saveRole({ id: role?.id, name: name.trim(), permissions: [...perms] }),
  );
  const del = useCommand(() => teamRepository.deleteRole(role?.id ?? ""));
  const toggle = (code: string) =>
    setPerms((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
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
      {groupPermissions(permissions).map((g) => (
        <div key={g.section?.id ?? "other"} className="flex flex-col gap-1">
          <h3 className={eyebrow({ tone: "muted" })}>{t(g.section?.title ?? "perm.mod.other")}</h3>
          <ul className="flex flex-col">
            {g.codes.map((code) => {
              const has = perms.has(code);
              // Владельца в свою роль не включают; чужого права, которого нет у
              // самого человека, тоже не выдать (сервер всё равно откажет).
              const allowed = !locked && code !== "org.manage" && mine.has(code);
              const label = PERM_KEYS[code] ? t(PERM_KEYS[code]) : code;
              const desc = PERM_DESC[code] ? t(PERM_DESC[code]) : null;
              return (
                <li key={code}>
                  <label
                    className={cn(
                      "flex items-start gap-3 py-1.5",
                      allowed ? "cursor-pointer" : "cursor-default",
                    )}
                  >
                    {locked ? (
                      has ? (
                        <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                      ) : (
                        <Minus
                          aria-hidden
                          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                        />
                      )
                    ) : (
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 shrink-0 accent-primary"
                        disabled={!allowed && !has}
                        checked={has}
                        onChange={() => allowed && toggle(code)}
                      />
                    )}
                    <span className="flex min-w-0 flex-col">
                      <span className={cn("text-sm", !has && !allowed && "text-muted-foreground")}>
                        {label}
                      </span>
                      {desc && <span className="text-xs text-muted-foreground">{desc}</span>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {err && (
        <p role="alert" className="text-xs text-destructive">
          {t(err)}
        </p>
      )}
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
