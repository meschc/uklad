import type {
  Box,
  CellAddress,
  ChatMessage,
  ExpectedShipment,
  FulfillmentRequest,
  Pallet,
  Product,
  ReceivingEvent,
  StaffMember,
} from "../types";

/**
 * Проверка формы данных на границе хранилища (п.0.4).
 *
 * Это НЕ схема на каждое поле: задача — отличить «это вообще похоже на
 * Product/Box/Pallet» от мусора. Сегодня она страхует от испорченного
 * localStorage одного домена (не роняя приложение целиком), завтра встретит
 * первый неожиданный ответ настоящего backend. Полная валидация каждого поля
 * тут была бы вторым описанием типов, которое разъедется с первым.
 */

type Rec = Record<string, unknown>;

const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null;
const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const hasId = (v: unknown): v is Rec => isRec(v) && isStr(v.id) && v.id !== "";

export type Guard<T> = (value: unknown) => value is T;

export const isCellAddress: Guard<CellAddress> = (v): v is CellAddress =>
  isRec(v) && isStr(v.floorId) && isStr(v.moduleId) && isNum(v.shelfIndex) && isNum(v.cellIndex);

const isBoxLine = (v: unknown): boolean => isRec(v) && isStr(v.productId) && isNum(v.qty);

export const isProduct: Guard<Product> = (v): v is Product =>
  hasId(v) && isStr(v.name) && isStr(v.sku);

export const isBox: Guard<Box> = (v): v is Box =>
  hasId(v) &&
  isStr(v.barcode) &&
  Array.isArray(v.lines) &&
  v.lines.every(isBoxLine) &&
  (v.address === undefined || isCellAddress(v.address));

export const isPallet: Guard<Pallet> = (v): v is Pallet =>
  hasId(v) &&
  isStr(v.barcode) &&
  Array.isArray(v.boxIds) &&
  v.boxIds.every(isStr) &&
  (v.address === undefined || isCellAddress(v.address));

export const isExpectedShipment: Guard<ExpectedShipment> = (v): v is ExpectedShipment =>
  hasId(v) &&
  isStr(v.source) &&
  Array.isArray(v.lines) &&
  v.lines.every((l) => hasId(l) && isStr((l as Rec).productId) && isNum((l as Rec).expectedQty));

export const isReceivingEvent: Guard<ReceivingEvent> = (v): v is ReceivingEvent =>
  hasId(v) && isStr(v.productId) && isNum(v.qty) && isNum(v.timestamp);

export const isRequest: Guard<FulfillmentRequest> = (v): v is FulfillmentRequest =>
  hasId(v) && isStr(v.productId) && isNum(v.qty) && isStr(v.status);

export const isStaffMember: Guard<StaffMember> = (v): v is StaffMember => hasId(v) && isStr(v.name);

/**
 * Сообщение переписки. `from` проверяется только на «строка»: список ролей
 * живёт в `UserRole` и меняется вместе с продуктом, а здесь важно отличить
 * реплику от мусора, а не пересказать перечисление вторым списком, который
 * разъедется с первым.
 */
export const isChatMessage: Guard<ChatMessage> = (v): v is ChatMessage =>
  hasId(v) && isStr(v.from) && isStr(v.text) && isNum(v.at);

/**
 * Отфильтровать список по проверке формы. Возвращает и сами записи, и число
 * выброшенных: молча терять данные нельзя — про потерю нужно хотя бы сказать
 * в консоль, чтобы её было видно при разборе жалобы «пропала коробка».
 */
export function keepValid<T>(
  value: unknown,
  guard: Guard<T>,
  label: string,
): { items: T[]; dropped: number } {
  if (!Array.isArray(value)) return { items: [], dropped: 0 };
  const items = value.filter(guard);
  const dropped = value.length - items.length;
  if (dropped > 0) {
    console.warn(`[uklad] ${label}: отброшено записей неверной формы — ${dropped}`);
  }
  return { items, dropped };
}
