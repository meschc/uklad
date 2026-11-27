import type { WorkstationKind } from "../types";
import { maySwitchTo } from "../stationSwitch";
import { nowMs, uid } from "../utils";
import { apiRequest } from "./api";
import { onServer } from "./badgeRepository";
import { storePort, type StorePort } from "./repository";
import { attempt, fail, ok, type Result } from "./result";

/**
 * Смена процесса с подтверждением старшего (Кирилл 15–16.11). Сотрудник
 * просит переход на ТСД, старший разрешает в кабинете на странице
 * «Подтверждения», стол применяет разрешённое — и только тогда процесс
 * меняется. На сервере — `deskSwitch.js` (заявки в таблице, переход строкой
 * журнала стола); в демо заявки живут в сторе, и кабинет в той же вкладке
 * видит их так же.
 */

type SwitchStatus = "pending" | "approved" | "declined" | "cancelled" | "applied";

export interface SwitchRequest {
  id: string;
  staffId: string;
  station: WorkstationKind;
  from?: WorkstationKind;
  at: number;
  status: SwitchStatus;
  /** Кто решил: id сотрудника склада или `member:<id>` для входа без карточки. */
  decidedBy?: string;
  /** Когда решили: у решённых, для вкладки «Решённые». */
  decidedAt?: number;
}

export interface SwitchRepository {
  /** Стол: попросить переход. Процесс не по роли — `ws.switch.denied`. */
  request: (station: WorkstationKind) => Promise<Result<string>>;
  /** Стол: что решили по заявке. */
  status: (id: string) => Promise<Result<Pick<SwitchRequest, "status" | "decidedBy">>>;
  /** Стол: применить разрешённую — процесс входа меняется. Ответ — кто разрешил. */
  apply: (id: string) => Promise<Result<string | undefined>>;
  cancel: (id: string) => Promise<Result<void>>;
  /** Стол: заявку решили без нас (отклонили, устарела) — больше не ждём. */
  forget: () => void;
  /** Кабинет: заявки, ждущие решения. */
  pending: () => Promise<Result<SwitchRequest[]>>;
  /** Кабинет: решённые за смену — разрешённые, применённые столом, отклонённые. */
  decided: () => Promise<Result<SwitchRequest[]>>;
  /** Кабинет: разрешить или отклонить. */
  decide: (id: string, approve: boolean) => Promise<Result<void>>;
}

const STATIONS = new Set(["receiving", "picking", "pack", "sorting", "shipping", "inventory"]);
const asStation = (v: unknown): WorkstationKind | undefined =>
  typeof v === "string" && STATIONS.has(v) ? (v as WorkstationKind) : undefined;
const DECIDED = new Set<SwitchStatus>(["approved", "declined", "applied"]);
/** Решённые показываем за смену, как сервер (`OPEN_FOR` в `deskSwitch.js`). */
const DECIDED_FOR_MS = 12 * 60 * 60 * 1000;

/** Строки заявок с сервера; кривые отбрасываем, как «похоже ли на запись». */
function readRequests(rows: Record<string, unknown>[], decided: boolean): SwitchRequest[] {
  const out: SwitchRequest[] = [];
  for (const r of rows) {
    const station = asStation(r.station);
    if (typeof r.id !== "string" || typeof r.staffRef !== "string" || !station) continue;
    const status =
      decided && typeof r.status === "string" && DECIDED.has(r.status as SwitchStatus)
        ? (r.status as SwitchStatus)
        : "pending";
    if (decided && status === "pending") continue;
    out.push({
      id: r.id,
      staffId: r.staffRef,
      station,
      from: asStation(r.from),
      at: typeof r.at === "number" ? r.at : 0,
      status,
      ...(typeof r.decidedBy === "string" ? { decidedBy: r.decidedBy } : {}),
      ...(typeof r.decidedAt === "number" ? { decidedAt: r.decidedAt } : {}),
    });
  }
  return out;
}

export function createSwitchRepository(port: StorePort = storePort): SwitchRepository {
  const local = () => port.get().switchRequests ?? [];
  const put = (id: string, patch: Partial<SwitchRequest>) =>
    port.set({ switchRequests: local().map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  const changeStation = (station: WorkstationKind) => {
    const s = port.get();
    if (!s.stationSession) return;
    port.set({ stationSession: { ...s.stationSession, station }, pendingSwitch: null });
  };

  return {
    request: async (station) => {
      const session = port.get().stationSession;
      if (!session || !maySwitchTo(session.station, station, session.permissions)) {
        return fail("ws.switch.denied");
      }
      if (onServer(port)) {
        const res = await attempt(() =>
          apiRequest("POST", "/desk/switch", { station, from: session.station }),
        );
        if (!res.ok) return fail("ws.switch.offline");
        const { status, body } = res.data;
        if (status === 403) return fail("ws.switch.denied");
        if (status !== 200 || typeof body.id !== "string") return fail("data.failed");
        port.set({ pendingSwitch: { id: body.id, station } });
        return ok(body.id);
      }
      const id = uid("sw");
      const left = local().map((r) =>
        r.staffId === session.staffId && r.status === "pending"
          ? { ...r, status: "cancelled" as const }
          : r,
      );
      port.set({
        switchRequests: [
          ...left,
          {
            id,
            staffId: session.staffId,
            station,
            from: session.station,
            at: nowMs(),
            status: "pending",
          },
        ],
        pendingSwitch: { id, station },
      });
      return ok(id);
    },
    status: async (id) => {
      if (onServer(port)) {
        const res = await attempt(() =>
          apiRequest("GET", `/desk/switch?id=${encodeURIComponent(id)}`),
        );
        if (!res.ok) return res;
        const { status, body } = res.data;
        if (status !== 200 || typeof body.status !== "string") return fail("data.failed");
        return ok({
          status: body.status as SwitchStatus,
          ...(typeof body.decidedBy === "string" ? { decidedBy: body.decidedBy } : {}),
        });
      }
      const r = local().find((x) => x.id === id);
      return r ? ok({ status: r.status, decidedBy: r.decidedBy }) : fail("data.failed");
    },
    apply: async (id) => {
      const want = port.get().pendingSwitch;
      if (!want || want.id !== id) return fail("ws.switch.denied");
      if (onServer(port)) {
        const res = await attempt(() =>
          apiRequest("POST", "/desk/switch/apply", { id, at: nowMs() }),
        );
        if (!res.ok) return fail("ws.switch.offline");
        const { status, body } = res.data;
        if (status !== 200 || asStation(body.station) !== want.station) {
          return fail("ws.switch.denied");
        }
        changeStation(want.station);
        return ok(typeof body.approvedBy === "string" ? body.approvedBy : undefined);
      }
      const r = local().find((x) => x.id === id);
      if (!r || r.status !== "approved") return fail("ws.switch.denied");
      put(id, { status: "applied" });
      changeStation(r.station);
      return ok(r.decidedBy);
    },
    cancel: async (id) => {
      port.set({ pendingSwitch: null });
      if (onServer(port)) {
        const res = await attempt(() => apiRequest("POST", "/desk/switch/cancel", { id }));
        return res.ok ? ok(undefined) : fail("ws.switch.offline");
      }
      put(id, { status: "cancelled" });
      return ok(undefined);
    },
    forget: () => port.set({ pendingSwitch: null }),
    pending: async () => {
      if (onServer(port)) {
        const res = await attempt(() => apiRequest("GET", "/cabinet/switch-requests"));
        if (!res.ok) return res;
        const { status, body } = res.data;
        if (status !== 200 || !Array.isArray(body.requests)) return fail("data.failed");
        return ok(readRequests(body.requests as Record<string, unknown>[], false));
      }
      return ok(local().filter((r) => r.status === "pending"));
    },
    decided: async () => {
      if (onServer(port)) {
        const res = await attempt(() =>
          apiRequest("GET", "/cabinet/switch-requests?status=decided"),
        );
        if (!res.ok) return res;
        const { status, body } = res.data;
        if (status !== 200 || !Array.isArray(body.requests)) return fail("data.failed");
        return ok(readRequests(body.requests as Record<string, unknown>[], true));
      }
      const since = nowMs() - DECIDED_FOR_MS;
      return ok(
        local()
          .filter((r) => DECIDED.has(r.status) && (r.decidedAt ?? r.at) > since)
          .sort((a, b) => (b.decidedAt ?? b.at) - (a.decidedAt ?? a.at)),
      );
    },
    decide: async (id, approve) => {
      if (onServer(port)) {
        const res = await attempt(() =>
          apiRequest("POST", "/cabinet/switch-requests/decide", { id, approve }),
        );
        if (!res.ok) return res;
        // Уже решили (другой старший) или заявка устарела.
        if (res.data.status === 404) return fail("approvals.gone");
        return res.data.status === 200 ? ok(undefined) : fail("data.failed");
      }
      const r = local().find((x) => x.id === id);
      if (!r || r.status !== "pending") return fail("approvals.gone");
      put(id, { status: approve ? "approved" : "declined", decidedAt: nowMs() });
      return ok(undefined);
    },
  };
}

export const switchRepository = createSwitchRepository();
