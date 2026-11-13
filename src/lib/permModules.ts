import type { MsgKey } from "./i18n";

/**
 * Права ролей по модулям кабинета: одни функции для всех, роль даёт по модулю
 * чтение, запись или ничего. Коды прав — серверные (`uklad.permissions`,
 * миграции 002 и 024); здесь только группировка для экрана «Доступ».
 *
 * `where` — честно, где сервер проверяет право уже сейчас: у стола (вход по
 * бейджу), в кабинете (каталог и план — запись по полям,
 * `server/api/src/cabinet/writeScope.js`) или пока нигде (право записано в
 * роли, а раздел правит только «Персонал»).
 */

export type PermLevel = "write" | "read" | "none";
type PermWhere = "desk" | "cabinet" | "later";

export interface PermModule {
  id: string;
  title: MsgKey;
  /** Права, которые дают только смотреть. */
  read: string[];
  /** Права, которые дают менять. */
  write: string[];
  where: PermWhere;
}

export const PERM_MODULES: PermModule[] = [
  {
    id: "company",
    title: "perm.mod.company",
    read: ["billing.view"],
    write: ["org.manage"],
    where: "later",
  },
  { id: "staff", title: "perm.mod.staff", read: [], write: ["staff.manage"], where: "cabinet" },
  {
    id: "contracts",
    title: "perm.mod.contracts",
    read: [],
    write: ["contracts.manage"],
    where: "later",
  },
  { id: "plan", title: "perm.mod.plan", read: [], write: ["plan.edit"], where: "cabinet" },
  {
    id: "products",
    title: "perm.mod.products",
    read: [],
    write: ["products.edit"],
    where: "cabinet",
  },
  {
    id: "stock",
    title: "perm.mod.stock",
    read: ["stock.view"],
    write: ["stock.move"],
    // Чтение открывает кабинет на просмотр; перемещение — у стола операциями.
    where: "cabinet",
  },
  {
    id: "receiving",
    title: "perm.mod.receiving",
    read: [],
    write: ["receiving.do"],
    where: "desk",
  },
  { id: "picking", title: "perm.mod.picking", read: [], write: ["picking.do"], where: "desk" },
  { id: "packing", title: "perm.mod.packing", read: [], write: ["packing.do"], where: "desk" },
  { id: "shipping", title: "perm.mod.shipping", read: [], write: ["shipping.do"], where: "desk" },
  { id: "goods", title: "perm.mod.goods", read: [], write: ["goods.decide"], where: "desk" },
  {
    id: "inventory",
    title: "perm.mod.inventory",
    read: [],
    write: ["inventory.count"],
    where: "desk",
  },
  {
    id: "seller",
    title: "perm.mod.seller",
    read: [],
    write: ["seller.requests"],
    where: "later",
  },
  { id: "chat", title: "perm.mod.chat", read: [], write: ["chat.use"], where: "later" },
];

/** Подпись права в списке галочек. */
export const PERM_KEYS: Record<string, MsgKey> = {
  "org.manage": "perm.org.manage",
  "billing.view": "perm.billing.view",
  "staff.manage": "perm.staff.manage",
  "contracts.manage": "perm.contracts.manage",
  "plan.edit": "perm.plan.edit",
  "products.edit": "perm.products.edit",
  "stock.view": "perm.stock.view",
  "stock.move": "perm.stock.move",
  "receiving.do": "perm.receiving.do",
  "picking.do": "perm.picking.do",
  "packing.do": "perm.packing.do",
  "shipping.do": "perm.shipping.do",
  "goods.decide": "perm.goods.decide",
  "inventory.count": "perm.inventory.count",
  "seller.requests": "perm.seller.requests",
  "chat.use": "perm.chat.use",
};

/** Что роль может в модуле: запись сильнее чтения. */
export function moduleLevel(m: PermModule, perms: Iterable<string>): PermLevel {
  const have = new Set(perms);
  if (m.write.some((p) => have.has(p))) return "write";
  if (m.read.some((p) => have.has(p))) return "read";
  return "none";
}

/**
 * Права по модулям для списка галочек. Право, которого нет ни в одном модуле
 * (сервер добавил новое раньше экрана), не теряется — уходит в «Прочее».
 */
export function groupPermissions(
  codes: string[],
): { module: PermModule | null; codes: string[] }[] {
  const known = new Set(codes);
  const groups = PERM_MODULES.map((m) => ({
    module: m as PermModule | null,
    codes: [...m.read, ...m.write].filter((c) => known.has(c)),
  })).filter((g) => g.codes.length > 0);
  const placed = new Set(PERM_MODULES.flatMap((m) => [...m.read, ...m.write]));
  const rest = codes.filter((c) => !placed.has(c));
  return rest.length > 0 ? [...groups, { module: null, codes: rest }] : groups;
}
