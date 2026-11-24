import { Phone } from "lucide-react";
import { useEditor } from "@/lib/store";
import type { StaffMember } from "@/lib/types";
import type { TFunc } from "@/lib/i18n";
import { Avatar } from "@/components/ui/avatar";
import { Select } from "@/components/ui/select";

/**
 * Ответственное лицо склада — отдельным блоком вверху «Сотрудников» (Кирилл
 * 24.11): выбирается из сотрудников и выглядит как их строка. Своей формы с
 * именем и телефоном больше нет: человек уже заведён в списке, второй раз его
 * не вводят, и телефон в документах не расходится с карточкой.
 *
 * Связь — по id сотрудника: правка карточки сразу видна и здесь. Запись,
 * заведённая старой формой (id `mgr-…`), показывается как есть, пока не выберут
 * человека из списка.
 */
export function ManagerBlock({ staff, t }: { staff: StaffMember[]; t: TFunc }) {
  const manager = useEditor((s) => s.warehouse.manager);
  const updateManager = useEditor((s) => s.updateManager);
  const notify = useEditor((s) => s.notify);
  const live = manager ? (staff.find((m) => m.id === manager.id) ?? null) : null;
  const shown = live ?? (manager?.name ? manager : null);

  const pick = (id: string) => {
    const m = staff.find((x) => x.id === id);
    if (!m) return;
    updateManager({
      id: m.id,
      name: m.name,
      role: m.role,
      phone: m.phone,
      email: m.email,
      photoUrl: m.photoUrl,
    });
    notify("success", "staff.managerSaved");
  };

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">{t("staff.manager")}</h2>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {shown ? (
          <div className="flex min-w-0 items-center gap-3 text-sm">
            <Avatar src={shown.photoUrl} seed={shown.id} />
            <span className="flex min-w-0 flex-col">
              <span className="font-medium">{shown.name}</span>
              <span className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                {shown.role && <span>{shown.role}</span>}
                {shown.phone && (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="size-3" />
                    {shown.phone}
                  </span>
                )}
              </span>
            </span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("staff.managerNone")}</p>
        )}
        {staff.length > 0 ? (
          <Select
            className="h-8 w-56"
            aria-label={t("staff.managerPick")}
            value={live?.id ?? ""}
            onChange={(e) => pick(e.target.value)}
          >
            <option value="" disabled>
              {t("staff.managerPick")}
            </option>
            {staff.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        ) : (
          <p className="text-sm text-muted-foreground">{t("staff.managerAddFirst")}</p>
        )}
      </div>
    </section>
  );
}
