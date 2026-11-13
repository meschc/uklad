import { useState } from "react";
import { AtSign, Check, IdCard, Pencil, Phone, Trash2 } from "lucide-react";
import type { StaffMember } from "@/lib/types";
import type { TeamRole } from "@/lib/data/teamRepository";
import { useEditor } from "@/lib/store";
import { badgeRepository, staffRepository } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import type { TFunc } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Avatar } from "@/components/ui/avatar";
import { PersonForm } from "./PersonForm";
import { draftToMember, formatRate, type PersonDraft } from "@/lib/personDraft";
import { BadgePanel } from "./BadgePanel";

/**
 * Строка сотрудника: просмотр, правка на месте, удаление.
 *
 * Команды живут здесь, а не в экране (п.3.2.1): строки независимы, и отказ по
 * одному человеку не должен красить ошибкой всю таблицу. Показываются они по
 * общему правилу п.3.2.2, только в третьей его форме — подвала у строки нет,
 * а форма есть:
 *
 *  · правка не сохранилась — строка остаётся раскрытой, набранное на месте,
 *    красная строка под формой, а галочка сохранения зовётся «Повторить»
 *    (кнопка иконочная, поэтому надпись живёт в `title`/`aria-label`);
 *  · удаление формы не имеет и терять ему нечего — отказ уходит тостом.
 */
export function StaffRow({
  member: m,
  number,
  access,
  editing,
  onEdit,
  onDone,
  t,
}: {
  member: StaffMember;
  /** Табельный номер (`staffNumbers`) — тот же, что на бейдже. */
  number?: number;
  /**
   * Роль у стола: что сотрудник может по бейджу. Нет — колонки нет (демо или
   * нет права на персонал).
   */
  access?: {
    roles: TeamRole[];
    roleId: string | null;
    onChange: (id: string | null) => void;
  } | null;
  editing: boolean;
  onEdit: () => void;
  /** Правка закончена — экрану остаётся свернуть строку. */
  onDone: () => void;
  t: TFunc;
}) {
  const showToast = useEditor((s) => s.showToast);
  const restore = useEditor((s) => s.restoreStaffMember);
  const [form, setForm] = useState<PersonDraft>({
    name: m.name,
    role: m.role,
    phone: m.phone ?? "",
    email: m.email ?? "",
    photoUrl: m.photoUrl ?? "",
    rate: m.hourlyRate ? formatRate(String(m.hourlyRate)) : "",
  });

  const save = useCommand((patch: Partial<Omit<StaffMember, "id">>) =>
    staffRepository.update(m.id, patch),
  );
  // Ушедший сотрудник не должен входить за стол старым бейджем: на сервере
  // бейдж гаснет до удаления, и если погасить не вышло, человек остаётся.
  const remove = useCommand(async () => {
    const off = await badgeRepository.revoke(m.id);
    return off.ok ? staffRepository.remove(m.id) : off;
  });
  const issue = useCommand(() => badgeRepository.issue(m.id));
  const [badge, setBadge] = useState<string | null>(null);

  const submit = async () => {
    const res = await save.run(draftToMember(form));
    if (res.ok) onDone();
  };

  if (editing) {
    const label = t(save.error ? "data.retry" : "common.save");
    return (
      <tr className="border-t border-border/60 bg-accent/40">
        <td className="px-3 py-2" colSpan={access ? 4 : 3}>
          <PersonForm
            withRate
            value={form}
            onChange={(patch) => setForm({ ...form, ...patch })}
            t={t}
          />
          {save.error && (
            <p role="alert" className="pt-2 text-xs text-destructive">
              {t(save.error)}
            </p>
          )}
        </td>
        <td className="px-3 py-2 align-top">
          <Button
            size="icon-sm"
            variant="ghost"
            title={label}
            aria-label={label}
            disabled={save.pending}
            onClick={submit}
          >
            <Check className="size-4" />
          </Button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="group border-t border-border/60">
      <td className="px-3 py-2">
        <button onClick={onEdit} className="flex min-w-0 items-center gap-3 text-left">
          {/* shrink-0: фото не сжимается, когда соседний текст длинный
              (Кирилл 13.11: «размер фотографии уменьшается кратно»). */}
          <Avatar src={m.photoUrl} seed={m.id} />
          <span className="flex min-w-0 flex-col">
            <span className="font-medium">
              {m.name}
              {number != null && (
                <span className="ml-2 text-xs font-normal tabular-nums text-muted-foreground">
                  № {number}
                </span>
              )}
            </span>
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
      <td className="px-3 py-2 text-muted-foreground">{m.role || "—"}</td>
      {/* Ставка видна прямо в списке: пустая клетка зовёт её задать, а
          задаётся она той же правкой строки, что имя и телефон. */}
      <td className="px-3 py-2 text-right tabular-nums">
        {m.hourlyRate ? (
          t("staff.rateValue", { r: m.hourlyRate })
        ) : (
          <button onClick={onEdit} className="text-xs text-primary hover:underline">
            {t("staff.rateSet")}
          </button>
        )}
      </td>
      {access && (
        <td className="px-3 py-2">
          <Select
            size="sm"
            aria-label={t("team.role")}
            className="w-44"
            value={access.roleId ?? ""}
            onChange={(e) => access.onChange(e.target.value || null)}
          >
            <option value="">{t("team.deskNone")}</option>
            {access.roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </td>
      )}
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            onClick={async () => {
              const res = await issue.run();
              if (res.ok) setBadge(res.data);
              else showToast(res.error, undefined, undefined, "error");
            }}
            disabled={issue.pending}
            title={t("staff.badge.issue")}
            aria-label={t("staff.badge.issue")}
            className="flex size-7 items-center justify-center rounded text-muted-foreground transition hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
          >
            <IdCard className="size-3.5" />
          </button>
          {badge && (
            <BadgePanel
              member={m}
              number={number}
              code={badge}
              onClose={() => setBadge(null)}
              t={t}
            />
          )}
          {/* Правка — отдельной кнопкой: нажатие на имя неочевидно (Кирилл 13.11). */}
          <button
            onClick={onEdit}
            title={t("staff.edit")}
            aria-label={t("staff.edit")}
            className="flex size-7 items-center justify-center rounded text-muted-foreground transition hover:text-foreground"
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
              if (!res.ok) showToast(res.error, undefined, undefined, "error");
              else
                showToast("staff.removed", { name: m.name }, () =>
                  restore({ ...m, number: m.number ?? number }, Math.max(0, index)),
                );
            }}
            disabled={remove.pending}
            title={t("staff.remove")}
            aria-label={t("staff.remove")}
            className="flex size-7 items-center justify-center rounded text-muted-foreground opacity-0 transition hover:text-destructive focus-visible:opacity-100 disabled:pointer-events-none disabled:opacity-30 group-hover:opacity-100"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}
