import { useState } from "react";
import { AtSign, Check, Phone, Trash2, UserRound } from "lucide-react";
import type { StaffMember } from "@/lib/types";
import { useEditor } from "@/lib/store";
import { staffRepository } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import type { TFunc } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { PersonForm, type PersonDraft } from "./PersonForm";

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
  editing,
  onEdit,
  onDone,
  t,
}: {
  member: StaffMember;
  editing: boolean;
  onEdit: () => void;
  /** Правка закончена — экрану остаётся свернуть строку. */
  onDone: () => void;
  t: TFunc;
}) {
  const showToast = useEditor((s) => s.showToast);
  const [form, setForm] = useState<PersonDraft>({
    name: m.name,
    role: m.role,
    phone: m.phone ?? "",
    email: m.email ?? "",
    photoUrl: m.photoUrl ?? "",
  });

  const save = useCommand((patch: Partial<Omit<StaffMember, "id">>) =>
    staffRepository.update(m.id, patch),
  );
  const remove = useCommand(() => staffRepository.remove(m.id));

  const submit = async () => {
    const res = await save.run(form);
    if (res.ok) onDone();
  };

  if (editing) {
    const label = t(save.error ? "data.retry" : "common.save");
    return (
      <tr className="border-t border-border/60 bg-accent/40">
        <td className="px-3 py-2" colSpan={3}>
          <PersonForm value={form} onChange={(patch) => setForm({ ...form, ...patch })} t={t} />
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
        <button onClick={onEdit} className="flex items-center gap-2 text-left">
          {m.photoUrl ? (
            <img
              src={m.photoUrl}
              alt=""
              className="size-7 rounded-full border border-border object-cover"
            />
          ) : (
            <span className="flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <UserRound className="size-3.5" />
            </span>
          )}
          <span className="font-medium">{m.name}</span>
        </button>
      </td>
      <td className="px-3 py-2 text-muted-foreground">{m.role || "—"}</td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
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
          {!m.phone && !m.email && "—"}
        </div>
      </td>
      <td className="px-3 py-2">
        <button
          onClick={async () => {
            const res = await remove.run();
            if (!res.ok) showToast(res.error);
          }}
          disabled={remove.pending}
          title={t("staff.remove")}
          aria-label={t("staff.remove")}
          className="flex size-7 items-center justify-center rounded text-muted-foreground opacity-0 transition hover:text-destructive focus-visible:opacity-100 disabled:pointer-events-none disabled:opacity-30 group-hover:opacity-100"
        >
          <Trash2 className="size-3.5" />
        </button>
      </td>
    </tr>
  );
}
