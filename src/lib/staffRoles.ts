import type { TFunc } from "@/lib/i18n";

/**
 * Справочник должностей склада.
 *
 * Почему список, а не свободная строка: должность попадает в подписи печатных
 * документов и в выгрузку сотрудников, а руками её пишут каждый раз по-своему —
 * «комплектовщик», «Комплектовщик», «компл.», «сборщик». В отчёте это уже три
 * разные должности, и никакой группировки по ним не построить.
 *
 * Почему в модель кладём подпись, а не ключ: `PersonDraft.role` — это то, что
 * печатается в акте и уезжает в CSV (`staffIO.ts`). Ключ пришлось бы переводить
 * в каждой точке вывода, включая уже выгруженные файлы, где переводчика нет.
 * Плата за это — должность, выбранная в русском интерфейсе, останется русской
 * после переключения языка. Это осознанно: подпись в подписанном документе
 * менять задним числом нельзя.
 *
 * Список закрытым не делаем: складов много и должности у всех свои, поэтому в
 * форме рядом со списком всегда есть «Другая должность…» со свободным вводом.
 * Импорт из CSV по той же причине принимает любую строку.
 */
const ROLE_KEYS = [
  "staff.role.loader",
  "staff.role.picker",
  "staff.role.packer",
  "staff.role.stockman",
  "staff.role.seniorStockman",
  "staff.role.receiver",
  "staff.role.operator",
  "staff.role.forklift",
  "staff.role.reachTruck",
  "staff.role.shiftLead",
  "staff.role.warehouseManager",
  "staff.role.warehouseHead",
  "staff.role.dispatcher",
  "staff.role.logistics",
  "staff.role.account",
  "staff.role.security",
  "staff.role.accountant",
  "staff.role.director",
] as const;

/** Подписи должностей на языке интерфейса, в порядке «от склада к офису». */
export function staffRoleOptions(t: TFunc): string[] {
  return ROLE_KEYS.map((key) => t(key));
}

/**
 * Есть ли такая должность в справочнике. Нужно форме, чтобы понять, показывать
 * выпадающий список или свободный ввод: должность из старой карточки или из
 * импорта справочнику не обязана соответствовать, и терять её нельзя.
 */
export function isKnownStaffRole(role: string, t: TFunc): boolean {
  return staffRoleOptions(t).includes(role);
}
