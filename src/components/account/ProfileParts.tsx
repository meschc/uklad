import { useState } from "react";
import { Bell, Check, MessageSquareText } from "lucide-react";
import type { Theme } from "@/lib/types";
import { useEditor } from "@/lib/store";
import { askNotifyPermission, notifyPermission, type NotifyPermission } from "@/lib/chatNotify";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { Row } from "./ProfileRow";

/**
 * Части экрана профиля, которые разбивают его на разделы. Раньше профиль был
 * одним столбцом одинаковых строк, и глазу не за что было зацепиться (Кирилл,
 * 21 окт): теперь визитка сверху, разделы с заголовками в две колонки, тема —
 * плитками с превью.
 */

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="px-1 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function ProfileHero({
  name,
  email,
  org,
  tariff,
  avatar,
}: {
  avatar?: string;
  name: string;
  email: string;
  org?: string;
  tariff: string | null;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <div className={card({ className: "flex flex-wrap items-center gap-4" })}>
      {avatar ? (
        <img src={avatar} alt="" className="size-14 shrink-0 rounded-2xl object-cover" />
      ) : (
        <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-xl font-semibold text-primary-foreground">
          {initials || "·"}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold">{name}</p>
        <p className="truncate text-sm text-muted-foreground">
          {[email, org].filter(Boolean).join(" · ")}
        </p>
      </div>
      {tariff && (
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          {tariff}
        </span>
      )}
    </div>
  );
}

/** Плитка темы с маленьким превью интерфейса в этой теме. */
export function ThemeTile({
  theme,
  active,
  label,
  onClick,
}: {
  theme: Theme;
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        card({ pad: "none" }),
        "flex cursor-pointer flex-col overflow-hidden text-left transition-colors",
        active ? "ring-2 ring-primary" : "hover:border-foreground/20",
      )}
    >
      {/* Превью рисуется фиксированными цветами, а не токенами: плитка тёмной
          темы должна быть тёмной и в светлом интерфейсе. */}
      <div className={cn("flex h-20 gap-2 p-3", dark ? "bg-[#18181b]" : "bg-[#f4f4f5]")}>
        <div className={cn("w-6 rounded", dark ? "bg-[#27272a]" : "bg-white")} />
        <div className="flex flex-1 flex-col gap-1.5">
          <div className={cn("h-2 w-2/3 rounded", dark ? "bg-[#3f3f46]" : "bg-[#d4d4d8]")} />
          <div className={cn("h-2 w-1/2 rounded", dark ? "bg-[#3f3f46]" : "bg-[#e4e4e7]")} />
          <div className="mt-auto h-3 w-10 rounded bg-primary" />
        </div>
      </div>
      <div className="flex items-center justify-between px-3 py-2.5 text-sm font-medium">
        {label}
        {active && <Check className="size-4 text-primary" />}
      </div>
    </button>
  );
}

type OnOff = "on" | "off";

/**
 * Уведомления о сообщениях: включить системные и решить, виден ли в них текст.
 *
 * Включение спрашивает разрешение у браузера — отсюда, по нажатию, иначе
 * браузер вопрос не покажет. Отказ не включает настройку молча: под строкой
 * сказано, где его снять. Показ текста настраивается и без разрешения: на
 * сервере та же галочка решает и для Телеграма, и для писем.
 */
export function NotifySection() {
  const t = useT();
  const profile = useEditor((s) => s.profile);
  const updateProfile = useEditor((s) => s.updateProfile);
  const [permission, setPermission] = useState<NotifyPermission>(notifyPermission);
  const on = profile.chatNotify === true && permission === "granted";

  const toggle = async (next: OnOff) => {
    if (next === "off") return updateProfile({ chatNotify: false });
    const got = permission === "granted" ? permission : await askNotifyPermission();
    setPermission(got);
    updateProfile({ chatNotify: got === "granted" });
  };

  const hint =
    permission === "denied"
      ? t("profile.notify.denied")
      : permission === "unsupported"
        ? t("profile.notify.unsupported")
        : null;
  const onOff = [
    { value: "on" as const, label: t("profile.notify.on") },
    { value: "off" as const, label: t("profile.notify.off") },
  ];

  return (
    <div
      className={card({
        pad: "none",
        className: "flex flex-col divide-y divide-border overflow-hidden",
      })}
    >
      <div>
        <Row icon={<Bell className="size-4" />} label={t("profile.notify.browser")}>
          <Segmented<OnOff> value={on ? "on" : "off"} onChange={toggle} options={onOff} />
        </Row>
        {hint && <p className="px-4 pb-3 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div>
        <Row icon={<MessageSquareText className="size-4" />} label={t("profile.notify.preview")}>
          <Segmented<OnOff>
            value={profile.chatNotifyPreview === false ? "off" : "on"}
            onChange={(v) => updateProfile({ chatNotifyPreview: v === "on" })}
            options={onOff}
          />
        </Row>
        <p className="px-4 pb-3 text-xs text-muted-foreground">{t("profile.notify.previewHint")}</p>
      </div>
    </div>
  );
}
