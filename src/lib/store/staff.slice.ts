import { nowMs, uid } from "../utils";
import type { Partner, StaffMember, Warehouse } from "../types";
import type { SliceCreator, StaffSlice } from "./state";

/**
 * Персонал и контакты склада (п.6). Хранятся в самом складе, а не отдельным
 * срезом: список сотрудников — свойство конкретного склада, при переключении
 * склада он должен меняться вместе с ним.
 */

/** Применить правку к активному складу (он всегда ровно один). */
function patchActive(warehouse: Warehouse, fn: (staff: StaffMember[]) => StaffMember[]): Warehouse {
  return { ...warehouse, staff: fn(warehouse.staff ?? []) };
}

/** Правка списка партнёров активного склада. */
function patchPartners(warehouse: Warehouse, fn: (partners: Partner[]) => Partner[]): Warehouse {
  return { ...warehouse, partners: fn(warehouse.partners ?? []) };
}

/**
 * Готовая запись сотрудника из введённого. Одна на добавление и на импорт:
 * разъехавшись, они дают две разные записи об одном и том же человеке — так
 * фото и терялось, приезжая из CSV в форму и пропадая на пути в список.
 */
function makeMember(member: Omit<StaffMember, "id">): StaffMember {
  return {
    id: uid("staff"),
    name: member.name.trim() || "Без имени",
    role: member.role.trim(),
    phone: member.phone?.trim() || undefined,
    email: member.email?.trim() || undefined,
    photoUrl: member.photoUrl?.trim() || undefined,
  };
}

export const createStaffSlice: SliceCreator<StaffSlice> = (set) => ({
  addStaffMember: (member) => {
    const created = makeMember(member);
    set((s) => ({
      warehouse: patchActive(s.warehouse, (staff) => [...staff, created]),
    }));
    return created.id;
  },

  /**
   * Загрузка списка из файла — одним `set`, а не циклом по `addStaffMember`:
   * иначе история разложит импорт по одному человеку, а сервер получит столько
   * запросов, сколько строк в файле.
   */
  importStaff: (members) =>
    set((s) => ({
      warehouse: patchActive(s.warehouse, (staff) => [...staff, ...members.map(makeMember)]),
    })),

  updateStaffMember: (id, patch) =>
    set((s) => ({
      warehouse: patchActive(s.warehouse, (staff) =>
        staff.map((m) =>
          m.id === id
            ? {
                ...m,
                ...patch,
                name: patch.name != null ? patch.name.trim() || m.name : m.name,
              }
            : m,
        ),
      ),
    })),

  removeStaffMember: (id) =>
    set((s) => ({
      warehouse: patchActive(s.warehouse, (staff) => staff.filter((m) => m.id !== id)),
    })),

  updateManager: (patch) =>
    set((s) => ({
      warehouse: {
        ...s.warehouse,
        manager: {
          id: s.warehouse.manager?.id ?? uid("mgr"),
          name: s.warehouse.manager?.name ?? "",
          role: s.warehouse.manager?.role ?? "",
          ...s.warehouse.manager,
          ...patch,
        },
      },
    })),

  addPartner: (partner) => {
    const id = uid("partner");
    set((s) => ({
      warehouse: patchPartners(s.warehouse, (list) => [
        ...list,
        {
          id,
          name: partner.name.trim() || "Без названия",
          contact: partner.contact?.trim() || undefined,
        },
      ]),
    }));
    return id;
  },

  updatePartner: (id, patch) =>
    set((s) => ({
      warehouse: patchPartners(s.warehouse, (list) =>
        list.map((p) =>
          p.id === id
            ? {
                ...p,
                ...patch,
                name: patch.name != null ? patch.name.trim() || p.name : p.name,
              }
            : p,
        ),
      ),
    })),

  removePartner: (id) =>
    set((s) => ({
      warehouse: patchPartners(s.warehouse, (list) => list.filter((p) => p.id !== id)),
    })),

  updateWarehouseContacts: (id, patch) =>
    set((s) => {
      const apply = (w: Warehouse): Warehouse => ({
        ...w,
        phone: patch.phone?.trim() || undefined,
        email: patch.email?.trim() || undefined,
        contactPerson: patch.contactPerson?.trim() || undefined,
      });
      if (s.warehouse.id === id) return { warehouse: apply(s.warehouse) };
      return {
        otherWarehouses: s.otherWarehouses.map((w) => (w.id === id ? apply(w) : w)),
      };
    }),

  /**
   * Паспорт склада: условия хранения, режим работы, пожарная безопасность.
   * Патч частичный — поля заполняются по мере готовности, а не разом.
   */
  updateWarehouseSpec: (id, patch) =>
    set((s) => {
      const apply = (w: Warehouse): Warehouse => ({
        ...w,
        spec: { ...(w.spec ?? {}), ...patch, updatedAt: nowMs() },
      });
      if (s.warehouse.id === id) return { warehouse: apply(s.warehouse) };
      return {
        otherWarehouses: s.otherWarehouses.map((w) => (w.id === id ? apply(w) : w)),
      };
    }),
});
