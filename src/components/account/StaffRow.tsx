import { useState } from "react";
import { AtSign, IdCard, Pencil, Phone, Trash2 } from "lucide-react";
import type { StaffMember } from "@/lib/types";
import { useEditor } from "@/lib/store";
import { badgeRepository, staffRepository } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import type { TFunc } from "@/lib/i18n";
import { Avatar } from "@/components/ui/avatar";
import { BadgePanel } from "./BadgePanel";

/**
 * Строка сотрудника: просмотр и удаление. Правка — панелью справа
 * (`StaffPanel`, Кирилл 14.11), строка только зовёт её через `onEdit`.
 *
 * Удаление формы не имеет и терять ему нечего — отказ уходит тостом.
 */
export function StaffRow({
  member: m,
  roleName,
  onEdit,
  t,
}: {
  member: StaffMember;
  /**
   * Роль сотрудника: что он может по бейджу. `undefined` — колонки нет (демо
   * или нет права на персонал), `null` — роль не назначена.
   */
  roleName?: string | null;
  onEdit: () => void;
  t: TFunc;
}) {
  const notify = useEditor((s) => s.notify);
  const restore = useEditor((s) => s.restoreStaffMember);
  // Ушедший сотрудник не должен входить за стол старым бейджем: на сервере
  // бейдж гаснет до удаления, и если погасить не вышло, человек остаётся.
  const remove = useCommand(async () => {
    const off = await badgeRepository.revoke(m.id);
    return off.ok ? staffRepository.remove(m.id) : off;
  });
  const [badgeOpen, setBadgeOpen] = useState(false);

  return (
    <tr className="group border-t border-border/60">
      <td className="px-3 py-2">
        <button onClick={onEdit} className="flex min-w-0 items-center gap-3 text-left">
          {/* shrink-0: фото не сжимается, когда соседний текст длинный
              (Кирилл 13.11: «размер фотографии уменьшается кратно»). */}
          <Avatar src={m.photoUrl} seed={m.id} />
          <span className="flex min-w-0 flex-col">
            <span className="font-medium">{m.name}</span>
            {(m.phone || m.email) && (
              <span className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                {m.phone && (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="size-3" />
                    {m.phone}
                  </span>
                )}
                {m.email && (
                  <span className="inline-flex items-center gap-1">
                    <AtSign className="size-3" />
                    {m.email}
                  </span>
                )}
              </span>
            )}
          </span>
        </button>
      </td>
      <td className="px-3 py-2 text-muted-foreground" data-label={t("staff.col.role")}>
        {m.role || "—"}
      </td>
      {/* Ставка видна прямо в списке: пустая клетка зовёт её задать, а
          задаётся она той же правкой строки, что имя и телефон. */}
      <td className="px-3 py-2 text-right tabular-nums" data-label={t("staff.rate")}>
        {m.hourlyRate ? (
          t("staff.rateValue", { r: m.hourlyRate })
        ) : (
          <button onClick={onEdit} className="tap-target text-xs text-primary hover:underline">
            {t("staff.rateSet")}
          </button>
        )}
      </td>
      {roleName !== undefined && (
        <td className="px-3 py-2" data-label={t("team.role")}>
          {roleName ?? (
            <span className="rounded-full bg-warning-fill px-2 py-0.5 text-xs font-medium text-warning-foreground">
              {t("team.deskNone")}
            </span>
          )}
        </td>
      )}
      <td className="stack-head px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setBadgeOpen(true)}
            title={t("staff.badge")}
            aria-label={t("staff.badge")}
            className="flex size-11 items-center md:size-7 justify-center rounded text-muted-foreground transition hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
          >
            <IdCard className="size-3.5" />
          </button>
          {badgeOpen && <BadgePanel member={m} onClose={() => setBadgeOpen(false)} t={t} />}
          {/* Правка — отдельной кнопкой: нажатие на имя неочевидно (Кирилл 13.11). */}
          <button
            onClick={onEdit}
            title={t("staff.edit")}
            aria-label={t("staff.edit")}
            className="flex size-11 items-center md:size-7 justify-center rounded text-muted-foreground transition hover:text-foreground"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            onClick={async () => {
              // Класс `undoable`: убираем сразу, вернуть можно из тоста.
              // Бейдж при удалении гаснет — после отмены его выпускают заново.
              const index = (useEditor.getState().warehouse.staff ?? []).findIndex(
                (x) => x.id === m.id,
              );
              const res = await remove.run();
              if (!res.ok) notify("error", res.error);
              else
                notify("success", "staff.removed", {
                  vars: { name: m.name },
                  undo: () => restore(m, Math.max(0, index)),
                });
            }}
            disabled={remove.pending}
            title={t("staff.remove")}
            aria-label={t("staff.remove")}
            className="flex size-11 items-center md:size-7 justify-center rounded text-muted-foreground transition hover:text-destructive disabled:pointer-events-none disabled:opacity-30 md:opacity-0 md:focus-visible:opacity-100 md:group-hover:opacity-100"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}
