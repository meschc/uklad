import { useState } from "react";
import { Menu, X } from "lucide-react";
import { selectRole, useEditor } from "@/lib/store";
import type { AppView, UserRole } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { navFor } from "./navItems";
import { SideNav } from "./SideNav";
import { useNavBadge } from "./useNavBadge";

/**
 * Что стоит на нижней панели телефона. С телефона в кабинет заходят за
 * короткими делами: глянуть задания, пробить код, ответить в чат. Остальное
 * — в «Ещё», где открывается то же меню, что на компьютере слева. Так
 * устроены мобильные кабинеты площадок: три-четыре частых пункта и «ещё».
 */
const PRIMARY: Record<UserRole, AppView[]> = {
  warehouse: ["tasks", "lookup", "chat"],
  seller: ["seller", "chat", "spec"],
};

/** Нижняя панель кабинета на телефоне; на компьютере её нет (`md:hidden`). */
export function MobileNav() {
  const appView = useEditor((s) => s.appView);
  const goToView = useEditor((s) => s.goToView);
  const role = useEditor(selectRole);
  const perms = useEditor((s) => s.session.permissions);
  const badgeFor = useNavBadge();
  const t = useT();
  // «Ещё» помнит, на каком экране его открыли: переход по любому пункту
  // меняет экран, и меню закрывается само, без эффекта.
  const [openedOn, setOpenedOn] = useState<AppView | null>(null);
  const open = openedOn === appView;
  const setOpen = (next: boolean) => setOpenedOn(next ? appView : null);

  const allowed = navFor(role, perms);
  const items = PRIMARY[role]
    .map((v) => allowed.find((leaf) => leaf.view === v))
    .filter((leaf) => leaf !== undefined);
  const onPrimary = items.some((leaf) => leaf.view === appView);

  return (
    <>
      <nav
        aria-label={t("nav.side.title")}
        className="flex shrink-0 items-stretch border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {items.map((leaf) => (
          <Tab
            key={leaf.view}
            icon={leaf.icon}
            label={t(leaf.key)}
            active={appView === leaf.view}
            badge={badgeFor(leaf.view)}
            onClick={() => goToView(leaf.view)}
          />
        ))}
        <Tab
          icon={Menu}
          label={t("nav.side.more")}
          active={open || !onPrimary}
          badge={0}
          onClick={() => setOpen(true)}
        />
      </nav>
      {open && (
        <div className="fixed inset-0 z-40 flex animate-fade-in flex-col bg-shell md:hidden">
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t("nav.side.close")}
            className="absolute right-3 top-3 z-10 flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-5" />
          </button>
          <SideNav variant="sheet" />
        </div>
      )}
    </>
  );
}

function Tab({
  icon: Icon,
  label,
  active,
  badge,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  badge: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-2xs font-medium transition-colors",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      <span className="relative">
        <Icon className="size-5" />
        {badge > 0 && (
          <span className="absolute -right-2.5 -top-1.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-2xs font-bold tabular-nums leading-4 text-primary-foreground">
            {badge}
          </span>
        )}
      </span>
      <span className="max-w-full truncate px-1">{label}</span>
    </button>
  );
}
