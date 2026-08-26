import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  Boxes,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Moon,
  PackagePlus,
  Plug,
  Printer,
  ScanLine,
  ScanSearch,
  Store,
  Tags,
  Truck,
  Sun,
  Users,
  type LucideIcon,
} from "lucide-react";
import { selectRole, useEditor } from "@/lib/store";
import type { AppView, UserRole } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Боковой рельс навигации по экранам приложения. Именно боковой, а не пункты в
 * верхней панели: экранов много, и сверху они бы не поместились рядом с
 * переключателем режимов просмотра плана.
 *
 * Экранов стало столько, что плоский список перестал читаться, поэтому рельс
 * двухуровневый: близкие по смыслу экраны собраны в группу, а группа
 * раскрывается подменю вбок. Рельс остаётся узким (ширина — деньги редактора),
 * но в нём теперь шесть пунктов вместо двенадцати.
 *
 * Рельс общий для всех экранов кабинета, включая редактор: его собственные
 * панели плавают внутри своей области и с рельсом не спорят.
 */

interface NavLeaf {
  view: AppView;
  key: string;
  icon: LucideIcon;
}

interface NavGroup {
  /** Служебный id группы — только для состояния «какая раскрыта». */
  id: string;
  key: string;
  icon: LucideIcon;
  items: NavLeaf[];
}

type NavEntry = NavLeaf | NavGroup;

const isGroup = (e: NavEntry): e is NavGroup => "items" in e;

const WAREHOUSE_NAV: NavEntry[] = [
  { view: "editor", key: "nav.side.plan", icon: Boxes },
  {
    // Ежедневный конвейер: товар приехал → его ждут → его собирают.
    id: "flow",
    key: "nav.group.flow",
    icon: Truck,
    items: [
      { view: "receiving", key: "nav.side.receiving", icon: PackagePlus },
      { view: "tasks", key: "nav.side.tasks", icon: ClipboardList },
      { view: "picking", key: "nav.side.picking", icon: ScanLine },
    ],
  },
  {
    // Всё, что уходит на бумагу. Наклейку и накладную печатают из одного
    // побуждения «сейчас пойду к принтеру», поэтому они рядом.
    id: "print",
    key: "nav.group.print",
    icon: Printer,
    items: [
      { view: "labels", key: "nav.side.labels", icon: Tags },
      { view: "documents", key: "nav.side.documents", icon: FileText },
    ],
  },
  {
    // Настройка самого склада: какой он, кто на нём работает, с чем связан.
    id: "setup",
    key: "nav.group.setup",
    icon: ClipboardCheck,
    items: [
      { view: "spec", key: "nav.side.spec", icon: ClipboardCheck },
      { view: "staff", key: "nav.side.staff", icon: Users },
      { view: "integrations", key: "nav.side.integrations", icon: Plug },
    ],
  },
  { view: "analytics", key: "nav.side.analytics", icon: BarChart3 },
  // «Что это?» — отдельным пунктом в самом низу: это не шаг работы и не
  // настройка, а справочник, к которому обращаются по случаю. Спрятанный в
  // группу, он требовал бы двух кликов ровно тогда, когда человек стоит с
  // непонятной коробкой в руках.
  { view: "lookup", key: "nav.side.lookup", icon: ScanSearch },
];

/**
 * У продавца свой короткий набор — он остаётся плоским: четыре пункта
 * группировать не в чем. Выход в кабинет (а с ним к списку складов и
 * переключателю роли) у обеих ролей один — логотип наверху рельса.
 */
const SELLER_NAV: NavEntry[] = [
  { view: "seller", key: "nav.side.seller", icon: Store },
  // План и номенклатуру продавец видит целиком, но только читает (п.26).
  { view: "editor", key: "nav.side.plan", icon: Boxes },
  { view: "spec", key: "nav.side.spec", icon: ClipboardCheck },
  { view: "staff", key: "nav.side.staff", icon: Users },
];

function entriesFor(role: UserRole): NavEntry[] {
  return role === "seller" ? SELLER_NAV : WAREHOUSE_NAV;
}

/**
 * Плоский список экранов, доступных роли. Им же `App.tsx` отсекает экраны,
 * недоступные текущей роли, — поэтому он должен разворачивать и группы.
 */
export function navFor(role: UserRole): NavLeaf[] {
  return entriesFor(role).flatMap((e) => (isGroup(e) ? e.items : [e]));
}

export function SideNav() {
  const appView = useEditor((s) => s.appView);
  const goToView = useEditor((s) => s.goToView);
  const goToDashboard = useEditor((s) => s.goToDashboard);
  const role = useEditor(selectRole);
  const theme = useEditor((s) => s.profile.theme);
  const updateProfile = useEditor((s) => s.updateProfile);
  const requests = useEditor((s) => s.requests);
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
  const badgeFor = (view: AppView) => (view === "tasks" ? openRequests : 0);

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
                <li className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
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
                        <span className="min-w-0 flex-1 truncate">
                          {t(item.key)}
                        </span>
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
