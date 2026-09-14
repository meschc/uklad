import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Boxes, Moon, Sun, type LucideIcon } from "lucide-react";
import { countUnread, selectRole, useEditor, visibleChatPartners } from "@/lib/store";
import { entriesFor, isGroup } from "./navItems";
import type { AppView } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { eyebrow } from "@/components/ui/eyebrow";

/**
 * Боковой рельс навигации по экранам приложения. Именно боковой, а не пункты в
 * верхней панели: экранов много, и сверху они бы не поместились рядом с
 * переключателем режимов просмотра плана.
 *
 * Экранов стало столько, что плоский список перестал читаться, поэтому рельс
 * двухуровневый: близкие по смыслу экраны собраны в группу, а группа
 * раскрывается подменю вбок. Рельс остаётся узким (ширина — деньги редактора),
 * но в нём теперь семь пунктов вместо тринадцати.
 *
 * Рельс общий для всех экранов кабинета, включая редактор: его собственные
 * панели плавают внутри своей области и с рельсом не спорят.
 */

export function SideNav() {
  const appView = useEditor((s) => s.appView);
  const goToView = useEditor((s) => s.goToView);
  const goToDashboard = useEditor((s) => s.goToDashboard);
  const role = useEditor(selectRole);
  const theme = useEditor((s) => s.profile.theme);
  const updateProfile = useEditor((s) => s.updateProfile);
  const requests = useEditor((s) => s.requests);
  // Счётчик чата считаем по тем же перепискам, что человек в чате и увидит:
  // продавцу видна одна, складу — все (см. visibleChatPartners).
  const unreadChats = useEditor((s) =>
    countUnread(s.chats, s.session.user.role, visibleChatPartners(s)),
  );
  const t = useT();
  const dark = theme === "dark";

  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);

  // Подменю закрывается кликом мимо и Escape: раскрытая группа перекрывает
  // содержимое экрана, и «залипнуть» ей нельзя.
  useEffect(() => {
    if (!openGroup) return;
    const onDown = (e: PointerEvent) => {
      if (!navRef.current?.contains(e.target as Node)) setOpenGroup(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenGroup(null);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openGroup]);

  // Счётчик на «Заданиях»: сколько заявок ждут склад прямо сейчас.
  const openRequests = requests.filter(
    (r) => r.status === "new" || r.status === "in_progress",
  ).length;
  const badgeFor = (view: AppView) => {
    if (view === "tasks") return openRequests;
    if (view === "chat") return unreadChats;
    return 0;
  };

  const open = (view: AppView) => {
    goToView(view);
    setOpenGroup(null);
  };

  return (
    <nav
      ref={navRef}
      aria-label={t("nav.side.title")}
      className="relative flex w-[4.5rem] shrink-0 flex-col items-center gap-1 border-r border-border bg-card py-3"
    >
      {/* Логотип — единственный выход в кабинет: привычка всего веба, поэтому
          отдельного пункта «Главная» в рельсе больше нет. Под курсором знак
          меняется на стрелку и проявляется подпись — чтобы «кликабельно» было
          видно, а не угадывалось. Строка подписи занимает место всегда (просто
          прозрачная), иначе рельс дёргался бы при каждом наведении. */}
      <button
        type="button"
        onClick={() => {
          setOpenGroup(null);
          goToDashboard();
        }}
        aria-label={t("nav.side.toDashboard")}
        className="group mb-1 flex w-[3.75rem] flex-col items-center gap-1 rounded-lg px-1 py-1"
      >
        <span className="flex size-8 items-center justify-center rounded-lg bg-foreground text-background transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
          <Boxes className="size-4 group-hover:hidden" />
          <ArrowLeft className="hidden size-4 group-hover:block" />
        </span>
        <span className="text-center text-[10px] font-medium leading-tight text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
          {t("nav.side.toDashboard")}
        </span>
      </button>

      {entriesFor(role).map((entry) => {
        if (!isGroup(entry)) {
          return (
            <RailButton
              key={entry.view}
              icon={entry.icon}
              label={t(entry.key)}
              active={appView === entry.view}
              current={appView === entry.view}
              badge={badgeFor(entry.view)}
              onClick={() => open(entry.view)}
            />
          );
        }

        const inside = entry.items.some((i) => i.view === appView);
        const badge = entry.items.reduce((s, i) => s + badgeFor(i.view), 0);
        const expanded = openGroup === entry.id;

        return (
          <div key={entry.id} className="relative w-full">
            <RailButton
              icon={entry.icon}
              label={t(entry.key)}
              active={inside || expanded}
              expanded={expanded}
              badge={badge}
              onClick={() => setOpenGroup(expanded ? null : entry.id)}
            />
            {expanded && (
              <ul className="absolute left-full top-0 z-50 ml-1 flex w-52 animate-scale-in flex-col gap-0.5 rounded-xl border border-border bg-popover p-1.5 shadow-lg">
                <li className={eyebrow({ size: "xs", className: "px-2 pb-1 pt-0.5" })}>
                  {t(entry.key)}
                </li>
                {entry.items.map((item) => {
                  const activeItem = appView === item.view;
                  const n = badgeFor(item.view);
                  return (
                    <li key={item.view}>
                      <button
                        onClick={() => open(item.view)}
                        aria-current={activeItem ? "page" : undefined}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium transition-colors",
                          activeItem
                            ? "bg-primary/10 text-primary"
                            : "text-foreground hover:bg-accent",
                        )}
                      >
                        <item.icon className="size-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{t(item.key)}</span>
                        {n > 0 && (
                          <span className="shrink-0 rounded-full bg-primary px-1.5 text-[10px] font-bold tabular-nums text-primary-foreground">
                            {n}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}

      {/* Роль переключается в кабинете: это выбор «чей это склад сегодня», а не
          навигация по экранам склада (п.5). */}
      <div className="mt-auto flex flex-col items-center gap-2 pt-2">
        <button
          onClick={() => updateProfile({ theme: dark ? "light" : "dark" })}
          aria-label={t("nav.theme")}
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
      </div>
    </nav>
  );
}

function RailButton({
  icon: Icon,
  label,
  active,
  current,
  expanded,
  badge,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  /** Пункт-экран: помечаем его как текущую страницу. У группы страницы нет. */
  current?: boolean;
  expanded?: boolean;
  badge: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={current ? "page" : undefined}
      aria-expanded={expanded}
      className={cn(
        "relative mx-auto flex w-[3.75rem] flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium leading-tight transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <Icon className="size-[1.15rem]" />
      <span className="text-center">{label}</span>
      {badge > 0 && (
        <span className="absolute right-1.5 top-1.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
          {badge}
        </span>
      )}
    </button>
  );
}
