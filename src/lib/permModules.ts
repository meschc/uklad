import type { MsgKey } from "./i18n";

/**
 * Права ролей для экрана «Персонал → Доступ»: одни функции для всех, роль —
 * набор прав. Коды прав — серверные (`uklad.permissions`, миграции 002, 024,
 * 030); здесь только разделы, подписи и объяснения. Проверяет право сервер:
 * у стола (`deskPerms.js`) и при записи кабинета (`writeScope.js`).
 */

export interface PermSection {
  id: string;
  title: MsgKey;
  /** Права раздела в порядке «от простого к сильному». */
  perms: string[];
}

/**
 * Разделы прав, как у GitHub: у каждого права своя строка с объяснением, что
 * оно даёт. Без таблицы «чтение/запись» — Кирилл 13.11: «непонятно, что на
 * чтение, что на запись». Право либо есть, либо нет.
 */
export const PERM_SECTIONS: PermSection[] = [
  {
    id: "stock",
    title: "perm.sec.stock",
    perms: ["stock.view", "products.edit", "plan.edit", "stock.move"],
  },
  {
    id: "desk",
    title: "perm.sec.desk",
    perms: ["receiving.do", "picking.do", "packing.do", "shipping.do", "inventory.count"],
  },
  // Списание подтверждает начальник (миграция 030): старший только просит.
  { id: "goods", title: "perm.sec.goods", perms: ["goods.decide", "goods.writeoff"] },
  {
    id: "people",
    title: "perm.sec.people",
    perms: ["staff.manage", "contracts.manage", "billing.view", "org.manage"],
  },
  { id: "sellers", title: "perm.sec.sellers", perms: ["seller.requests", "chat.use"] },
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
  "goods.writeoff": "perm.goods.writeoff",
  "inventory.count": "perm.inventory.count",
  "seller.requests": "perm.seller.requests",
  "chat.use": "perm.chat.use",
};

/** Что право даёт — строкой под названием. */
export const PERM_DESC: Record<string, MsgKey> = {
  "org.manage": "perm.desc.org.manage",
  "billing.view": "perm.desc.billing.view",
  "staff.manage": "perm.desc.staff.manage",
  "contracts.manage": "perm.desc.contracts.manage",
  "plan.edit": "perm.desc.plan.edit",
  "products.edit": "perm.desc.products.edit",
  "stock.view": "perm.desc.stock.view",
  "stock.move": "perm.desc.stock.move",
  "receiving.do": "perm.desc.receiving.do",
  "picking.do": "perm.desc.picking.do",
  "packing.do": "perm.desc.packing.do",
  "shipping.do": "perm.desc.shipping.do",
  "goods.decide": "perm.desc.goods.decide",
  "goods.writeoff": "perm.desc.goods.writeoff",
  "inventory.count": "perm.desc.inventory.count",
  "seller.requests": "perm.desc.seller.requests",
  "chat.use": "perm.desc.chat.use",
};

/**
 * Права по разделам. Право, которого нет ни в одном разделе (сервер добавил
 * новое раньше экрана), не теряется — уходит в «Прочее».
 */
export function groupPermissions(
  codes: string[],
): { section: PermSection | null; codes: string[] }[] {
  const known = new Set(codes);
  const groups = PERM_SECTIONS.map((sec) => ({
    section: sec as PermSection | null,
    codes: sec.perms.filter((c) => known.has(c)),
  })).filter((g) => g.codes.length > 0);
  const placed = new Set(PERM_SECTIONS.flatMap((sec) => sec.perms));
  const rest = codes.filter((c) => !placed.has(c));
  return rest.length > 0 ? [...groups, { section: null, codes: rest }] : groups;
}
