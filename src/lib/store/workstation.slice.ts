import { nowMs, uid } from "../utils";
import {
  SESSION_TTL_MS,
  allowedMarks,
  isSessionLive,
  parseBadge,
  shiftState,
} from "../workstation";
import type { StaffEvent } from "../types";
import type { EditorState, SliceCreator, WorkstationSlice } from "./state";

/**
 * Рабочее место по бейджу и журнал сотрудника.
 *
 * Сервера ещё нет, поэтому вход по бейджу — проверка, что такой сотрудник есть
 * в персонале склада, а сессия — запись в сторе. Когда появится backend,
 * бейдж станет одноразовым токеном, а журнал — таблицей; форма записей уже та.
 */

/** Вошедший сотрудник, если вход ещё жив. Истёкший вход — то же, что никакого. */
function liveStaffId(s: EditorState, now: number): string | null {
  return isSessionLive(s.stationSession, now) ? s.stationSession!.staffId : null;
}

function event(e: Omit<StaffEvent, "id">): StaffEvent {
  return { id: uid("sev"), ...e };
}

export const createWorkstationSlice: SliceCreator<WorkstationSlice> = (set, get) => ({
  staffEvents: [],
  stationSession: null,

  badgeLogin: (code, station) => {
    const staffId = parseBadge(code);
    const member = staffId && (get().warehouse.staff ?? []).find((m) => m.id === staffId);
    if (!member) return null;
    const now = nowMs();
    set({
      stationSession: {
        staffId: member.id,
        station,
        startedAt: now,
        expiresAt: now + SESSION_TTL_MS,
      },
    });
    return member.id;
  },

  stationLogout: () => set({ stationSession: null }),

  markShift: (type) => {
    const s = get();
    const now = nowMs();
    const staffId = liveStaffId(s, now);
    if (!staffId) return false;
    if (!allowedMarks(shiftState(s.staffEvents, staffId)).includes(type)) return false;
    set({
      staffEvents: [
        ...s.staffEvents,
        event({ staffId, type, at: now, station: s.stationSession?.station }),
      ],
    });
    return true;
  },

  logPackScan: (orderId, code, ok) => {
    const s = get();
    const now = nowMs();
    const staffId = liveStaffId(s, now);
    if (!staffId) return;
    set({
      staffEvents: [
        ...s.staffEvents,
        event({
          staffId,
          type: ok ? "pack_scan" : "pack_error",
          at: now,
          station: "pack",
          orderId,
          code,
        }),
      ],
    });
  },

  packOrder: (orderId, requestIds) => {
    const s = get();
    const now = nowMs();
    const staffId = liveStaffId(s, now);
    if (!staffId) throw new Error("station: no live session");
    const ids = new Set(requestIds);
    set({
      requests: s.requests.map((r) =>
        ids.has(r.id) && !r.packedAt
          ? { ...r, packedAt: now, packedBy: staffId, updatedAt: now }
          : r,
      ),
      staffEvents: [
        ...s.staffEvents,
        event({ staffId, type: "pack_done", at: now, station: "pack", orderId }),
      ],
    });
  },
});
