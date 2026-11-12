import type { TeamRole } from "@/lib/data/teamRepository";
import { PERM_MODULES, moduleLevel, type PermLevel } from "@/lib/permModules";
import { useT, type MsgKey } from "@/lib/i18n";

/**
 * Таблица «роль × модуль» во вкладке «Доступ»: что каждая роль может в
 * каждом модуле — запись, чтение или ничего — и где сервер это уже проверяет.
 * Только показ: права правятся в панели роли.
 */

const LEVEL_KEYS: Record<Exclude<PermLevel, "none">, MsgKey> = {
  write: "perm.level.write",
  read: "perm.level.read",
};

const WHERE_KEYS = {
  desk: "perm.where.desk",
  cabinet: "perm.where.cabinet",
  later: "perm.where.later",
} as const satisfies Record<string, MsgKey>;

export function RoleMatrix({ roles }: { roles: TeamRole[] }) {
  const t = useT();
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">{t("team.matrix")}</h2>
        <p className="max-w-2xl text-xs text-muted-foreground">{t("team.matrixLead")}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border text-left">
              <th scope="col" className="px-3 py-2 font-medium">
                {t("team.matrixModule")}
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                {t("team.matrixWhere")}
              </th>
              {roles.map((r) => (
                <th key={r.id} scope="col" className="whitespace-nowrap px-3 py-2 font-medium">
                  {r.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERM_MODULES.map((m) => (
              <tr key={m.id} className="border-b border-border last:border-0">
                <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-medium">
                  {t(m.title)}
                </th>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                  {t(WHERE_KEYS[m.where])}
                </td>
                {roles.map((r) => {
                  const level = moduleLevel(m, r.permissions);
                  return (
                    <td
                      key={r.id}
                      className={
                        level === "write"
                          ? "px-3 py-2 text-foreground"
                          : "px-3 py-2 text-muted-foreground"
                      }
                    >
                      {level === "none" ? "—" : t(LEVEL_KEYS[level])}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
