import type { StaffMember } from "./types";

/**
 * Подпись сотрудника в выпадающем списке: имя и должность.
 *
 * Одной строкой в общем месте, потому что списков таких уже два — приёмка и
 * погрузка, — и в них должно быть написано одно и то же. Должность здесь не
 * украшение: на складе работают тёзки и однофамильцы, и «Ким» в списке из
 * двадцати человек без должности выбирается наугад.
 */
export function staffOptionLabel(member: Pick<StaffMember, "name" | "role">): string {
  return member.role ? `${member.name} — ${member.role}` : member.name;
}
