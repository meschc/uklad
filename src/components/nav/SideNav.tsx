import { useState } from "react";
import {
  Boxes,
  ChevronDown,
  LifeBuoy,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { countUnread, selectRole, useEditor, visibleChatPartners } from "@/lib/store";
import { applyOrder, entriesFor, entryKey, isGroup, moveItem, type NavLeaf } from "./navItems";
import type { AppView } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { ReportProblemDialog } from "@/components/support/ReportProblemDialog";

/** Свёрнуто ли меню — удобство одного человека, поэтому в localStorage, а не в сторе. */
const COLLAPSED_KEY = "uklad-nav-collapsed";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Порядок пунктов, выставленный человеком: ключ списка → ключи записей. */
const ORDER_KEY = "uklad-nav-order";
type NavOrder = Record<string, string[]>;

function readOrder(): NavOrder {
  try {
    const raw = JSON.parse(localStorage.getItem(ORDER_KEY) ?? "{}") as unknown;
    return raw && typeof raw === "object" ? (raw as NavOrder) : {};
  } catch {
    return {};
  }
}

/** Что сейчас тащат: из какого списка и с какой позиции. */
interface Drag {
  list: string;
  index: number;
}

/**
 * Боковое меню экранов кабинета. Именно боковое, а не пункты в верхней панели:
 * экранов много, и сверху они бы не поместились рядом с переключателем режимов
 * просмотра плана.
 *
 * Меню широкое, с подписями в строку, а близкие экраны собраны в группы,
 * которые раскрываются ВНУТРИ меню, а не всплывающим окном вбок: вложенный
 * список видно целиком, путь к экрану читается как дерево, и ничего не
 * перекрывает содержимое экрана. Группа с текущим экраном открыта сразу.
 *
 * Редактору плана ширина дорога, поэтому меню сворачивается до колонки иконок
 * (кнопка внизу) — и остаётся свёрнутым между заходами.
 *
 * Пункты можно переставить перетаскиванием — и верхние, и внутри группы, но не
 * из группы в группу: группа собрана по смыслу, и экран, вытащенный из неё,
 * теряет соседей, с которыми его ищут. Порядок хранится у человека в браузере
 * отдельно для каждой роли.
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
  const [order, setOrder] = useState<NavOrder>(readOrder);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [reporting, setReporting] = useState(false);
  const [over, setOver] = useState<Drag | null>(null);
  const topKey = `${role}:top`;
  const entries = applyOrder(entriesFor(role), order[topKey], entryKey);
  const itemsOf = (groupId: string, items: NavLeaf[]) =>
    applyOrder(items, order[`${role}:${groupId}`], (i) => i.view);

  const saveOrder = (list: string, keys: string[]) => {
    const next = { ...order, [list]: keys };
    setOrder(next);
    try {
      localStorage.setItem(ORDER_KEY, JSON.stringify(next));
    } catch {
      // Приватный режим: порядок продержится до перезагрузки.
    }
  };

  /** Свойства перетаскивания для строки `index` списка `list` из ключей `keys`. */
  const dnd = (list: string, keys: string[], index: number) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.stopPropagation();
      e.dataTransfer.effectAllowed = "move";
      setDrag({ list, index });
    },
    onDragOver: (e: React.DragEvent) => {
      if (drag?.list !== list) return;
      e.preventDefault();
      e.stopPropagation();
      if (over?.list !== list || over.index !== index) setOver({ list, index });
    },
    onDrop: (e: React.DragEvent) => {
      if (drag?.list !== list) return;
      e.preventDefault();
      e.stopPropagation();
      if (drag.index !== index) saveOrder(list, moveItem(keys, drag.index, index));
      setDrag(null);
      setOver(null);
    },
    onDragEnd: () => {
      setDrag(null);
      setOver(null);
    },
    className: cn(
      drag?.list === list && drag.index === index && "opacity-40",
      over?.list === list &&
        over.index === index &&
        drag &&
        drag.index !== index &&
        (drag.index < index
          ? "shadow-[0_2px_0_0_hsl(var(--primary))]"
          : "shadow-[0_-2px_0_0_hsl(var(--primary))]"),
      "rounded-lg",
    ),
  });
  const topKeys = entries.map(entryKey);

  const [collapsed, setCollapsed] = useState(readCollapsed);
  // Раскрытые группы — набор, а не одна: человек держит открытыми те, куда
  // ходит, как папки в проводнике.
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () =>
      new Set(
        entries
          .filter((e) => isGroup(e) && e.items.some((i) => i.view === appView))
          .map((e) => (isGroup(e) ? e.id : "")),
      ),
  );

  const toggleGroup = (id: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      // Приватный режим: меню просто не запомнит выбор.
    }
  };

  // Счётчик на «Заданиях»: сколько заявок ждут склад прямо сейчас.
  const openRequests = requests.filter(
    (r) => r.status === "new" || r.status === "in_progress",
  ).length;
  const badgeFor = (view: AppView) => {
    if (view === "tasks") return openRequests;
    if (view === "chat") return unreadChats;
    return 0;
  };

  return (
    <nav
      aria-label={t("nav.side.title")}
      className={cn(
        "flex shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border bg-card px-2 py-3 transition-[width] duration-200",
        collapsed ? "w-[3.75rem]" : "w-56",
      )}
    >
      {/* Логотип — выход в кабинет: привычка всего веба, отдельного пункта
          «Главная» в меню нет. */}
      <button
        type="button"
        onClick={goToDashboard}
        title={t("nav.side.toDashboard")}
        aria-label={t("nav.side.toDashboard")}
        className="mb-2 flex h-10 cursor-pointer items-center gap-2.5 rounded-lg px-1.5 text-sm font-semibold tracking-tight hover:bg-accent"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-foreground text-background">
          <Boxes className="size-4" />
        </span>
        {!collapsed && <span className="truncate">Уклад</span>}
      </button>

      {entries.map((entry, index) => {
        if (!isGroup(entry)) {
          return (
            <div key={entry.view} {...dnd(topKey, topKeys, index)}>
              <NavRow
                icon={entry.icon}
                label={t(entry.key)}
                collapsed={collapsed}
                active={appView === entry.view}
                current={appView === entry.view}
                badge={badgeFor(entry.view)}
                onClick={() => goToView(entry.view)}
              />
            </div>
          );
        }

        const inside = entry.items.some((i) => i.view === appView);
        const expanded = openGroups.has(entry.id);
        // Свёрнутая группа не прячет непрочитанное внутри: сумма — на заголовке.
        const badge = expanded ? 0 : entry.items.reduce((s, i) => s + badgeFor(i.view), 0);

        return (
          <div key={entry.id} {...dnd(topKey, topKeys, index)}>
            <div className="flex flex-col gap-0.5">
              <NavRow
                icon={entry.icon}
                label={t(entry.key)}
                collapsed={collapsed}
                active={inside && !expanded}
                expanded={expanded}
                badge={badge}
                onClick={() => toggleGroup(entry.id)}
              />
              {expanded && (
                <ul
                  className={cn(
                    "flex animate-fade-in flex-col gap-0.5",
                    !collapsed && "ml-[1.15rem] border-l border-border pl-2",
                  )}
                >
                  {itemsOf(entry.id, entry.items).map((item, i, list) => (
                    <li
                      key={item.view}
                      {...dnd(
                        `${role}:${entry.id}`,
                        list.map((x) => x.view),
                        i,
                      )}
                    >
                      <NavRow
                        icon={item.icon}
                        label={t(item.key)}
                        collapsed={collapsed}
                        nested
                        active={appView === item.view}
                        current={appView === item.view}
                        badge={badgeFor(item.view)}
                        onClick={() => goToView(item.view)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        );
      })}

      <div className="mt-auto flex flex-col gap-0.5 pt-2">
        <NavRow
          icon={LifeBuoy}
          label={t("support.nav")}
          collapsed={collapsed}
          active={false}
          badge={0}
          onClick={() => setReporting(true)}
        />
        <NavRow
          icon={dark ? Sun : Moon}
          label={t("nav.theme")}
          collapsed={collapsed}
          active={false}
          badge={0}
          onClick={() => updateProfile({ theme: dark ? "light" : "dark" })}
        />
        <NavRow
          icon={collapsed ? PanelLeftOpen : PanelLeftClose}
          label={collapsed ? t("nav.expand") : t("nav.collapse")}
          collapsed={collapsed}
          active={false}
          badge={0}
          onClick={toggleCollapsed}
        />
      </div>
      {reporting && <ReportProblemDialog onClose={() => setReporting(false)} />}
    </nav>
  );
}

function NavRow({
  icon: Icon,
  label,
  collapsed,
  active,
  current,
  expanded,
  nested,
  badge,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  collapsed: boolean;
  active: boolean;
  /** Пункт-экран: помечаем его как текущую страницу. У группы страницы нет. */
  current?: boolean;
  /** Задано только у группы: раскрыта ли она. */
  expanded?: boolean;
  nested?: boolean;
  badge: number;
  onClick: () => void;
}) {
  const group = expanded !== undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      aria-current={current ? "page" : undefined}
      aria-expanded={expanded}
      className={cn(
        "relative flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-left text-sm font-medium transition-colors",
        nested ? "h-8" : "h-9",
        collapsed && "justify-center px-0",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <Icon className={cn("shrink-0", nested ? "size-4" : "size-[1.15rem]")} />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
      {badge > 0 && (
        <span
          className={cn(
            "flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-2xs font-bold tabular-nums text-primary-foreground",
            collapsed && "absolute right-0.5 top-0.5 min-w-4 px-1",
          )}
        >
          {badge}
        </span>
      )}
      {group && !collapsed && (
        <ChevronDown
          className={cn(
            "size-4 shrink-0 transition-transform",
            expanded ? "rotate-0" : "-rotate-90",
          )}
        />
      )}
    </button>
  );
}
