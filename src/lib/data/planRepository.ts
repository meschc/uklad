import { apiRequest, hasCabinetServer } from "./api";
import { attempt, fail, ok, type Result } from "./result";
import type { TariffId } from "../types";
import type { TariffFeatures } from "../tariff";

/** Состояние оплаты, как его считает админка (`admin/plans.js`, `billingState`). */
type PlanState = "trial" | "paid" | "overdue" | "blocked" | "archived";

/** Тариф компании с сервера: назначает Уклад, кабинет только смотрит. */
export interface CompanyPlan {
  /** Ключ тарифа админки; свой и корпоративный кабинет не переключает. */
  tariff: string;
  price: number | null;
  state: PlanState;
  /** Срок вышел и неделя отсрочки прошла: правка кабинета закрыта, столы работают. */
  readOnly: boolean;
  /** С какого момента правка закрыта или закроется, если не оплатить. */
  readOnlyAt: string | null;
  trialUntil: string | null;
  paidUntil: string | null;
  invoice: { number: string; amount: number; dueAt: string } | null;
  request: { tariff: TariffId; at: string } | null;
}

const TARIFFS: TariffId[] = ["start", "warehouse", "operator"];
export const isTariffId = (v: unknown): v is TariffId => TARIFFS.includes(v as TariffId);

const STATES: PlanState[] = ["trial", "paid", "overdue", "blocked", "archived"];
const str = (v: unknown) => (typeof v === "string" ? v : null);

/** Ответ сервера → план; чужая форма — `null`, а не выдуманные поля. */
export function readPlan(raw: unknown): CompanyPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.tariff !== "string" || !STATES.includes(p.state as PlanState)) return null;
  const inv = p.invoice as Record<string, unknown> | null | undefined;
  const req = p.request as Record<string, unknown> | null | undefined;
  return {
    tariff: p.tariff,
    price: typeof p.price === "number" ? p.price : null,
    state: p.state as PlanState,
    readOnly: p.readOnly === true,
    readOnlyAt: str(p.readOnlyAt),
    trialUntil: str(p.trialUntil),
    paidUntil: str(p.paidUntil),
    invoice:
      inv && typeof inv.number === "string" && typeof inv.amount === "number"
        ? { number: inv.number, amount: inv.amount, dueAt: str(inv.dueAt) ?? "" }
        : null,
    request: req && isTariffId(req.tariff) ? { tariff: req.tariff, at: str(req.at) ?? "" } : null,
  };
}

/** Тариф и функции для любого сотрудника: сервер сводит тариф и ручные включения. */
export interface CompanyFeatures {
  tariff: TariffId;
  features: TariffFeatures;
  readOnly: boolean;
}

/** Ключи функций админки (`admin/plans.js`, FEATURES) → функции кабинета. */
const FEATURE_KEYS: Record<keyof TariffFeatures, string> = {
  fullAnalytics: "analytics_full",
  personalManager: "personal_manager",
  weeklyEmailBackup: "weekly_backup",
};

/** Ответ `GET /company/features` → функции; чужая форма или свой тариф — `null`. */
export function readFeatures(body: Record<string, unknown>): CompanyFeatures | null {
  const f = body.features as Record<string, unknown> | null | undefined;
  if (!f || typeof f !== "object" || !isTariffId(body.tariff)) return null;
  const pay = body.payment as Record<string, unknown> | undefined;
  const on = (k: keyof TariffFeatures) => f[FEATURE_KEYS[k]] === true;
  return {
    tariff: body.tariff,
    features: {
      fullAnalytics: on("fullAnalytics"),
      personalManager: on("personalManager"),
      weeklyEmailBackup: on("weeklyEmailBackup"),
    },
    readOnly: pay?.readOnly === true,
  };
}

/**
 * Тариф компании (`GET /company/plan`, право `org.manage`) и просьба другого
 * (`POST /company/plan/request`). Переключить тариф сам кабинет не может:
 * его назначает Уклад. Демо без сервера — `null`: там тариф выбирается в
 * браузере.
 */
export const planRepository = {
  features: async (): Promise<Result<CompanyFeatures | null>> => {
    if (!hasCabinetServer) return ok(null);
    const res = await attempt(() => apiRequest("GET", "/company/features"), "plan.err.network");
    if (!res.ok) return res;
    if (res.data.status !== 200) return fail("plan.err.network");
    return ok(readFeatures(res.data.body));
  },

  get: async (): Promise<Result<CompanyPlan | null>> => {
    if (!hasCabinetServer) return ok(null);
    const res = await attempt(() => apiRequest("GET", "/company/plan"), "plan.err.network");
    if (!res.ok) return res;
    const { status, body } = res.data;
    if (status === 403) return fail("plan.err.forbidden");
    if (status !== 200) return fail("plan.err.network");
    return ok(readPlan(body.plan));
  },

  request: async (tariff: TariffId): Promise<Result<CompanyPlan | null>> => {
    if (!hasCabinetServer) return ok(null);
    const res = await attempt(
      () => apiRequest("POST", "/company/plan/request", { tariff }),
      "plan.err.network",
    );
    if (!res.ok) return res;
    const { status, body } = res.data;
    if (status === 403) return fail("plan.err.forbidden");
    if (status === 404) return fail("plan.err.noAccount");
    if (status !== 200) return fail("plan.err.network");
    return ok(readPlan(body.plan));
  },
};
