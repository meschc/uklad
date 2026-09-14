import {
  BarChart3,
  Boxes,
  ClipboardCheck,
  ClipboardList,
  FileText,
  MessagesSquare,
  PackagePlus,
  Plug,
  Printer,
  ScanLine,
  ScanSearch,
  Store,
  Tags,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { AppView, UserRole } from "@/lib/types";
import type { MsgKey } from "@/lib/i18n";

/**
 * Состав бокового рельса: какие экраны видит роль и как они сгруппированы.
 *
 * Лежит отдельно от `SideNav` намеренно. Во-первых, это данные, а не разметка:
 * их читают, спорят о порядке пунктов и правят чаще, чем сам рельс. Во-вторых,
 * список нужен не только рельсу — `App.tsx` теми же записями отсекает экраны,
 * недоступные текущей роли, и брать их из файла с компонентом значило бы
 * тащить за собой всю отрисовку.
 *
 * Рельс двухуровневый: близкие по смыслу экраны собраны в группу, а группа
 * раскрывается подменю вбок. Экранов стало столько, что плоский список
 * перестал читаться, но ширина рельса — деньги редактора, и расширять его
 * нельзя.
 */

/** Пункт-экран: конечная точка перехода. */
export interface NavLeaf {
  view: AppView;
  key: MsgKey;
  icon: LucideIcon;
}

/** Группа пунктов: сама никуда не ведёт, раскрывает подменю. */
export interface NavGroup {
  /** Служебный id группы — только для состояния «какая раскрыта». */
  id: string;
  key: MsgKey;
  icon: LucideIcon;
  items: NavLeaf[];
}

export type NavEntry = NavLeaf | NavGroup;

export const isGroup = (e: NavEntry): e is NavGroup => "items" in e;

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
  // Переписка с продавцами — сразу за конвейером и отдельным пунктом (п.3):
  // в неё заходят по десять раз на день, и прятать её в группу значило бы
  // добавить клик к самому частому действию после приёмки.
  { view: "chat", key: "nav.side.chat", icon: MessagesSquare },
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
 * У продавца свой короткий набор — он остаётся плоским: пять пунктов
 * группировать не в чем. Выход в кабинет (а с ним к списку складов и
 * переключателю роли) у обеих ролей один — логотип наверху рельса.
 */
const SELLER_NAV: NavEntry[] = [
  { view: "seller", key: "nav.side.seller", icon: Store },
  { view: "chat", key: "nav.side.chat", icon: MessagesSquare },
  // План и номенклатуру продавец видит целиком, но только читает (п.26).
  { view: "editor", key: "nav.side.plan", icon: Boxes },
  { view: "spec", key: "nav.side.spec", icon: ClipboardCheck },
  { view: "staff", key: "nav.side.staff", icon: Users },
];

/** Рельс роли — как он есть, с группами. */
export function entriesFor(role: UserRole): NavEntry[] {
  return role === "seller" ? SELLER_NAV : WAREHOUSE_NAV;
}

/**
 * Плоский список экранов, доступных роли. Им же `App.tsx` отсекает экраны,
 * недоступные текущей роли, — поэтому он должен разворачивать и группы.
 */
export function navFor(role: UserRole): NavLeaf[] {
  return entriesFor(role).flatMap((e) => (isGroup(e) ? e.items : [e]));
}
