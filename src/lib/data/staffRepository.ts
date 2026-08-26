import type { StaffMember } from "../types";
import { isStaffMember } from "./guards";
import { readList, storePort, type Repository, type StorePort } from "./repository";

/**
 * Персонал склада (п.0.4). Список принадлежит складу, а не аккаунту, — при
 * переключении склада он меняется вместе с ним, поэтому читается из активного
 * склада, а не из отдельного среза.
 */
export interface StaffRepository extends Repository<StaffMember> {
  create: (member: Omit<StaffMember, "id">) => Promise<string>;
  update: (id: string, patch: Partial<Omit<StaffMember, "id">>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function createStaffRepository(
  port: StorePort = storePort,
): StaffRepository {
  const all = () =>
    readList(() => port.get().warehouse.staff ?? [], isStaffMember, "staff");

  return {
    list: all,
    get: async (id) => (await all()).find((m) => m.id === id) ?? null,
    create: async (member) => port.get().addStaffMember(member),
    update: async (id, patch) => port.get().updateStaffMember(id, patch),
    remove: async (id) => port.get().removeStaffMember(id),
  };
}

export const staffRepository = createStaffRepository();
