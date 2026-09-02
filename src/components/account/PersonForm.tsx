import { useState } from "react";
import { UserRound } from "lucide-react";
import { formatPhone } from "@/lib/phone";
import type { TFunc } from "@/lib/i18n";
import { isKnownStaffRole, staffRoleOptions } from "@/lib/staffRoles";
import { Input } from "@/components/ui/input";

/**
 * Карточка человека — один шаблон и для сотрудника, и для ответственного лица
 * (п.24): имя, должность, телефон с маской, почта и фото по ссылке.
 */

export interface PersonDraft {
  name: string;
  role: string;
  phone: string;
  email: string;
  photoUrl: string;
}

export function PersonForm({
  value,
  onChange,
  t,
}: {
  value: PersonDraft;
  onChange: (patch: Partial<PersonDraft>) => void;
  t: TFunc;
}) {
  return (
    <div className="flex items-start gap-3">
      {/* Фото — по ссылке: файлового хранилища в прототипе нет. */}
      <div className="flex shrink-0 flex-col items-center gap-1">
        {value.photoUrl ? (
          <img
            src={value.photoUrl}
            alt=""
            className="size-11 rounded-full border border-border object-cover"
          />
        ) : (
          <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <UserRound className="size-5" />
          </span>
        )}
      </div>
      <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
        <Input
          value={value.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder={t("staff.namePlaceholder")}
          className="h-9"
        />
        <RoleField value={value.role} onChange={(role) => onChange({ role })} t={t} />
        <Input
          value={value.phone}
          onChange={(e) => onChange({ phone: formatPhone(e.target.value) })}
          placeholder="+7 495 000-00-00"
          inputMode="tel"
          className="h-9"
        />
        <Input
          type="email"
          value={value.email}
          onChange={(e) => onChange({ email: e.target.value })}
          placeholder={t("staff.email")}
          className="h-9"
        />
        <Input
          type="url"
          value={value.photoUrl}
          onChange={(e) => onChange({ photoUrl: e.target.value })}
          placeholder={t("staff.photoUrl")}
          className="h-9 sm:col-span-2"
        />
      </div>
    </div>
  );
}

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
function RoleField({
  value,
  onChange,
  t,
}: {
  value: string;
  onChange: (role: string) => void;
  t: TFunc;
}) {
  const [otherPicked, setOtherPicked] = useState(false);
  const isCustom = otherPicked || (value !== "" && !isKnownStaffRole(value, t));

  return (
    <div className="grid min-w-0 gap-2">
      <select
        value={isCustom ? OTHER : value}
        onChange={(e) => {
          const next = e.target.value;
          setOtherPicked(next === OTHER);
          onChange(next === OTHER ? "" : next);
        }}
        aria-label={t("staff.rolePlaceholder")}
        className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">{t("staff.rolePlaceholder")}</option>
        {staffRoleOptions(t).map((role) => (
          <option key={role} value={role}>
            {role}
          </option>
        ))}
        <option value={OTHER}>{t("staff.roleOther")}</option>
      </select>
      {isCustom ? (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("staff.roleCustom")}
          className="h-9"
          autoFocus={otherPicked}
        />
      ) : null}
    </div>
  );
}
