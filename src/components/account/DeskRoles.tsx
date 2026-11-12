import type { StaffMember } from "@/lib/types";
import type { TeamRole } from "@/lib/data/teamRepository";
import { useT } from "@/lib/i18n";
import { selectClass } from "./teamSelect";

/**
 * «Роли у стола»: роль каждого сотрудника, который входит за стол по
 * бейджу. Стол спрашивает права роли (`goods.decide`, `packing.do`…), а не
 * должность; назначить роль выше своей сервер не даст — экран лишь
 * переводит отказ тостом.
 */
export function DeskRoles({
  staff,
  roles,
  assigned,
  onChange,
}: {
  staff: StaffMember[];
  roles: TeamRole[];
  assigned: Record<string, string>;
  onChange: (staffRef: string, roleId: string | null) => void;
}) {
  const t = useT();
  // Руководитель должен видеть, кому роль ещё не назначили: без неё у стола
  // нет решений по товару, а после запуска правило станет строгим.
  const missing = staff.filter((m) => !assigned[m.id]).length;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">{t("team.desk")}</h2>
        <p className="max-w-2xl text-xs text-muted-foreground">{t("team.deskLead")}</p>
        {missing > 0 && (
          <p className="text-xs font-medium text-warning">
            {t("team.deskMissing", { n: missing })}
          </p>
        )}
      </div>
      {staff.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("team.deskEmpty")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {staff.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{m.name || "—"}</p>
                {!assigned[m.id] && <p className="text-xs text-warning">{t("team.deskNone")}</p>}
                {m.role && <p className="truncate text-xs text-muted-foreground">{m.role}</p>}
              </div>
              <select
                aria-label={t("team.role")}
                className={`${selectClass} w-44`}
                value={assigned[m.id] ?? ""}
                onChange={(e) => onChange(m.id, e.target.value || null)}
              >
                <option value="">{t("team.deskNone")}</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
