import { staffOptionLabel } from "@/lib/staff";
import { type TFunc } from "@/lib/i18n";
import { eyebrow } from "@/components/ui/eyebrow";

/**
 * Кто принимает. Поле необязательное: смена не должна вставать из-за того, что
 * человека забыли завести в списке — но если он выбран, приёмка подписана им.
 */
export function StaffPicker({
  staff,
  value,
  onChange,
  t,
}: {
  staff: { id: string; name: string; role: string }[];
  value: string;
  onChange: (v: string) => void;
  t: TFunc;
}) {
  if (!staff.length) return null;
  return (
    /* Поле по содержимому, а не во всю колонку: стрелка списка должна стоять
       у имени, а не уезжать к правому краю экрана. */
    <label className="flex flex-col items-start gap-1.5">
      <span className={eyebrow()}>{t("recv.staff")}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">{t("recv.staffNone")}</option>
        {staff.map((m) => (
          <option key={m.id} value={m.id}>
            {staffOptionLabel(m)}
          </option>
        ))}
      </select>
    </label>
  );
}
