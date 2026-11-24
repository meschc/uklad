import { useState } from "react";
import type { TFunc } from "@/lib/i18n";
import { isKnownStaffRole, staffRoleOptions } from "@/lib/staffRoles";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

/**
 * Значение пункта «Другая должность…». Пустой строкой быть не может — её занял
 * пункт-подсказка, а с настоящей должностью совпасть не должно.
 */
const OTHER = "__other__";

/**
 * Должность: выпадающий список справочника плюс свободный ввод под ним.
 *
 * Список сам по себе должность бы терял. Карточка могла быть заведена до
 * справочника или приехать импортом из CSV, и такой должности в списке нет —
 * select молча показал бы первый пункт и подменил данные при первом сохранении.
 * Поэтому незнакомая должность сразу открывает форму в режиме свободного ввода,
 * а не приводится к ближайшей из списка.
 */
export function RoleField({
  value,
  onChange,
  onBlur,
  t,
  ...aria
}: {
  value: string;
  onChange: (role: string) => void;
  onBlur?: () => void;
  t: TFunc;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  const [otherPicked, setOtherPicked] = useState(false);
  const isCustom = otherPicked || (value !== "" && !isKnownStaffRole(value, t));

  return (
    <div className="grid min-w-0 gap-2">
      <Select
        value={isCustom ? OTHER : value}
        onChange={(e) => {
          const next = e.target.value;
          setOtherPicked(next === OTHER);
          onChange(next === OTHER ? "" : next);
        }}
        aria-label={t("staff.rolePlaceholder")}
        {...(isCustom ? {} : aria)}
        className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">{t("staff.rolePlaceholder")}</option>
        {staffRoleOptions(t).map((role) => (
          <option key={role} value={role}>
            {role}
          </option>
        ))}
        <option value={OTHER}>{t("staff.roleOther")}</option>
      </Select>
      {isCustom ? (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("staff.roleCustom")}
          className="h-9"
          onBlur={onBlur}
          {...aria}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- поле появляется по выбору «другая роль»: фокус идёт следом за действием пользователя
          autoFocus={otherPicked}
        />
      ) : null}
    </div>
  );
}
