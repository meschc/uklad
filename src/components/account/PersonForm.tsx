import { useState } from "react";
import { UserRound } from "lucide-react";
import { formatPhone, PHONE_MAX_LENGTH } from "@/lib/phone";
import type { TFunc } from "@/lib/i18n";
import { isKnownStaffRole, staffRoleOptions } from "@/lib/staffRoles";
import { Input } from "@/components/ui/input";
import { ImagePicker } from "./ImagePicker";
import type { PersonDraft } from "@/lib/personDraft";
import { checkPerson } from "@/lib/validate";
import { useEditor } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";

/**
 * Ответственное лицо склада: имя, должность, телефон с маской, почта и фото.
 * Раньше каждая буква сразу уходила в стор — без проверки и без ответа, и
 * Кирилл не видел, сохранилось ли (14.11: «нет подтверждения»). Теперь —
 * черновик, ошибки под полями и явное «Сохранить» с уведомлением.
 */
export function PersonForm({
  value,
  onSave,
  t,
}: {
  value: PersonDraft;
  onSave: (person: PersonDraft) => void;
  t: TFunc;
}) {
  const notify = useEditor((s) => s.notify);
  const [draft, setDraft] = useState(value);
  const [shown, setShown] = useState<Set<string>>(new Set());
  const errors = checkPerson(draft);
  const dirty = (Object.keys(draft) as (keyof PersonDraft)[]).some((k) => draft[k] !== value[k]);
  const patch = (p: Partial<PersonDraft>) => setDraft((d) => ({ ...d, ...p }));
  const show = (f: string) => () => setShown((s) => (s.has(f) ? s : new Set(s).add(f)));
  const errOf = (f: keyof typeof errors) => (shown.has(f) && errors[f] ? t(errors[f]) : undefined);
  const save = () => {
    if (Object.keys(errors).length) return setShown(new Set(Object.keys(errors)));
    onSave(draft);
    setShown(new Set());
    notify("success", "staff.managerSaved");
  };

  return (
    <div className="flex items-start gap-3">
      {/* Фото — файлом с устройства или ссылкой в поле ниже: ссылка не
          нагружает наш сервер, файл удобнее, когда ссылки нет. */}
      <ImagePicker
        value={draft.photoUrl || undefined}
        fallback={
          <span className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <UserRound className="size-5" />
          </span>
        }
        onChange={(photoUrl) => patch({ photoUrl: photoUrl ?? "" })}
      />
      <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("staff.col.name")} error={errOf("name")}>
          <Input
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
            onBlur={show("name")}
            placeholder={t("staff.namePlaceholder")}
          />
        </Field>
        <Field label={t("staff.col.role")} error={errOf("role")}>
          <RoleField
            value={draft.role}
            onChange={(role) => patch({ role })}
            onBlur={show("role")}
            t={t}
          />
        </Field>
        <Field label={t("staff.phone")} error={errOf("phone")}>
          <Input
            value={draft.phone}
            maxLength={PHONE_MAX_LENGTH}
            onChange={(e) => patch({ phone: formatPhone(e.target.value) })}
            onBlur={show("phone")}
            placeholder="+7 495 000-00-00"
            inputMode="tel"
          />
        </Field>
        <Field label={t("staff.email")} error={errOf("email")}>
          <Input
            type="email"
            value={draft.email}
            onChange={(e) => patch({ email: e.target.value })}
            onBlur={show("email")}
            placeholder="name@example.ru"
          />
        </Field>
        <Field label={t("staff.photoUrl")} error={errOf("photoUrl")} className="sm:col-span-2">
          <Input
            type="url"
            // Загруженный файл живёт в поле как data:-адрес — его не показываем.
            value={draft.photoUrl.startsWith("data:") ? "" : draft.photoUrl}
            onChange={(e) => patch({ photoUrl: e.target.value })}
            onBlur={show("photoUrl")}
            placeholder="https://"
          />
        </Field>
        <div className="flex gap-2 sm:col-span-2">
          <Button size="sm" disabled={!dirty} onClick={save}>
            {t("common.save")}
          </Button>
          {dirty && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => (setDraft(value), setShown(new Set()))}
            >
              {t("common.cancel")}
            </Button>
          )}
        </div>
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
