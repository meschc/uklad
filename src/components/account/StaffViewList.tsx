import { Users } from "lucide-react";
import type { StaffMember } from "@/lib/types";
import type { TFunc } from "@/lib/i18n";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/fulfillment/ScreenShell";

/**
 * Персонал на чтение (`staff.view` без `staff.manage`, Кирилл 14.11): «если он
 * не может редактировать, зачем ему инпуты». Только кто работает и на какой
 * должности — без ставок, телефонов, кнопок и панели сотрудника. Ставки и
 * контакты сервер такой роли и не отдаёт (`viewer.js`).
 */
export function StaffViewList({ staff, t }: { staff: StaffMember[]; t: TFunc }) {
  if (staff.length === 0)
    return (
      <EmptyState
        icon={<Users className="size-5" />}
        title={t("staff.emptyTitle")}
        body={t("staff.emptyBody")}
      />
    );
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">
        {t("staff.people")} · {staff.length}
      </h2>
      <ul className="flex flex-col divide-y divide-border">
        {staff.map((m) => (
          <li key={m.id} className="flex items-center gap-3 py-2">
            <Avatar src={m.photoUrl} seed={m.id} />
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-medium">{m.name}</span>
              {m.role && <span className="text-xs text-muted-foreground">{m.role}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
