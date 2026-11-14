import type { MsgKey } from "./i18n";

/**
 * Права ролей для экрана «Персонал → Доступ». Коды прав — серверные
 * (`uklad.permissions`, миграции 002, 024, 030, 033); здесь только разделы,
 * подписи и объяснения. Проверяет право сервер: у стола (`deskPerms.js`), при
 * выдаче снимка (`viewer.js`) и при записи кабинета (`writeScope.js`).
 *
 * Кирилл 14.11: «чтение, чтение и запись — в этом суть прав». У раздела ровно
 * три уровня, и уровень однороден: раздел — одна работа, у неё одно право
 * «смотреть» и одно «делать». Поштучного подбора внутри раздела нет — если
 * разным людям в разделе нужно разное, раздел надо делить, а не прятать это
 * за «выборочно».
 */

export interface PermArea {
  id: string;
  title: MsgKey;
  /**
   * Право «смотреть». `null` — отдельного чтения нет (списание: смотреть его —
   * это чтение «Спорного товара»; чат: читать и не отвечать незачем), у
   * раздела только «нет» и «чтение и запись».
   */
  read: string | null;
  /** Права «делать»: уровень «чтение и запись» — это чтение плюс они. */
  write: string[];
  /** Что даёт чтение и что добавляет запись — строками под разделом. */
  readDesc: MsgKey | null;
  writeDesc: MsgKey;
}

function area(id: string, read: string | null, write: string[]): PermArea {
  return {
    id,
    title: `perm.area.${id}` as MsgKey,
    read,
    write,
    readDesc: read ? (`perm.area.${id}.read` as MsgKey) : null,
    writeDesc: `perm.area.${id}.write` as MsgKey,
  };
}

export const PERM_AREAS: PermArea[] = [
  area("products", "products.view", ["products.edit"]),
  area("stock", "stock.view", ["stock.move"]),
  area("plan", "plan.view", ["plan.edit"]),
  area("receiving", "receiving.view", ["receiving.do"]),
  area("picking", "picking.view", ["picking.do"]),
  area("packing", "packing.view", ["packing.do"]),
  area("shipping", "shipping.view", ["shipping.do"]),
  area("inventory", "inventory.view", ["inventory.count"]),
  // Старший решает по спорному, а списание подтверждает начальник (030):
  // поэтому это два раздела, а не «выборочно» в одном.
  area("goods", "goods.view", ["goods.decide"]),
  area("writeoff", null, ["goods.writeoff"]),
  area("staff", "staff.view", ["staff.manage"]),
  area("contracts", "billing.view", ["contracts.manage"]),
  // Переписка — одно право: читать чат и не отвечать продавцу складу не нужно.
  area("chat", null, ["chat.use"]),
  // Кабинет продавца — свой, товар только своего партнёра; одно право.
  area("seller", null, ["seller.requests"]),
];

/**
 * Право владельца: в свою роль не выдаётся, разделом не показывается —
 * владелец всегда один и видит всё.
 */
export const OWNER_PERM = "org.manage";

export type PermLevel = "none" | "read" | "write";

/** Все коды раздела. */
export const areaCodes = (a: PermArea): string[] => (a.read ? [a.read, ...a.write] : a.write);

/**
 * Уровень раздела у набора прав. Права «делать» без «смотреть» (роль из
 * старой версии, до миграции 033) — всё равно «чтение и запись»: делать, не
 * видя, нельзя, и сохранение добавит чтение само.
 */
export function areaLevel(perms: Set<string>, a: PermArea): PermLevel {
  if (a.write.every((c) => perms.has(c))) return "write";
  if (a.read && perms.has(a.read)) return "read";
  return "none";
}

/** Поставить разделу уровень: права раздела заменяются, остальные не трогаются. */
export function withLevel(perms: Set<string>, a: PermArea, level: PermLevel): Set<string> {
  const own = areaCodes(a);
  const next = new Set([...perms].filter((c) => !own.includes(c)));
  if (level !== "none" && a.read) next.add(a.read);
  if (level === "write") for (const c of a.write) next.add(c);
  return next;
}

/** Набор прав, приведённый к уровням: у каждого «делать» есть «смотреть». */
export function normalizePerms(perms: Set<string>): Set<string> {
  let next = new Set(perms);
  for (const a of PERM_AREAS) next = withLevel(next, a, areaLevel(next, a));
  return next;
}

/** Какие уровни раздела этот человек вправе выдать: больше своих не дать. */
export function grantableLevels(a: PermArea, mine: Set<string>): PermLevel[] {
  const out: PermLevel[] = ["none"];
  if (a.read && mine.has(a.read)) out.push("read");
  if (areaCodes(a).every((c) => mine.has(c))) out.push("write");
  return out;
}

/**
 * Разделы, которые знает сервер, и права вне разделов. Раздел без единого
 * своего права на сервере не показывается (у склада без продавцов нет
 * «Заявок продавца»). Право, которого нет ни в одном разделе (сервер добавил
 * новое раньше экрана), не теряется — уходит в «Прочее».
 */
export function groupPermissions(codes: string[]): { areas: PermArea[]; rest: string[] } {
  const known = new Set(codes);
  const areas = PERM_AREAS.filter((a) => areaCodes(a).some((c) => known.has(c)));
  const placed = new Set([...PERM_AREAS.flatMap(areaCodes), OWNER_PERM]);
  return { areas, rest: codes.filter((c) => !placed.has(c)) };
}
