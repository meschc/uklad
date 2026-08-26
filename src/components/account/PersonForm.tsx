import { UserRound } from "lucide-react";
import { formatPhone } from "@/lib/phone";
import type { TFunc } from "@/lib/i18n";
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
        <Input
          value={value.role}
          onChange={(e) => onChange({ role: e.target.value })}
          placeholder={t("staff.rolePlaceholder")}
          className="h-9"
        />
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
