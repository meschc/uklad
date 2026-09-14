import type { StaffMember } from "../types";
import { isStaffMember } from "./guards";
import { pickOne, readList, storePort, type Repository, type StorePort } from "./repository";
import { attempt, type Result } from "./result";

/**
 * Персонал склада (п.0.4). Список принадлежит складу, а не аккаунту, — при
 * переключении склада он меняется вместе с ним, поэтому читается из активного
 * склада, а не из отдельного среза.
 */
export interface StaffRepository extends Repository<StaffMember> {
  create: (member: Omit<StaffMember, "id">) => Promise<Result<string>>;
  /** Загрузка из файла отдельным методом: сервер примет её одним запросом. */
  importMany: (members: Omit<StaffMember, "id">[]) => Promise<Result<void>>;
  update: (id: string, patch: Partial<Omit<StaffMember, "id">>) => Promise<Result<void>>;
  remove: (id: string) => Promise<Result<void>>;
}

export function createStaffRepository(port: StorePort = storePort): StaffRepository {
  const all = () => readList(() => port.get().warehouse.staff ?? [], isStaffMember, "staff");

  return {
    list: all,
    get: (id) => pickOne(all, (m) => m.id === id),
    create: (member) => attempt(() => port.get().addStaffMember(member)),
    importMany: (members) => attempt(() => port.get().importStaff(members)),
    update: (id, patch) => attempt(() => port.get().updateStaffMember(id, patch)),
    remove: (id) => attempt(() => port.get().removeStaffMember(id)),
  };
}

export const staffRepository = createStaffRepository();
