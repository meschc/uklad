import { apiRequest, hasCabinetServer } from "./api";
import { attempt, fail, ok, type Result } from "./result";
import type { TariffId } from "../types";

/** Состояние оплаты, как его считает админка (`admin/plans.js`, `billingState`). */
type PlanState = "trial" | "paid" | "overdue" | "blocked" | "archived";

/** Тариф компании с сервера: назначает Уклад, кабинет только смотрит. */
export interface CompanyPlan {
  /** Ключ тарифа админки; свой и корпоративный кабинет не переключает. */
  tariff: string;
  price: number | null;
  state: PlanState;
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
    trialUntil: str(p.trialUntil),
    paidUntil: str(p.paidUntil),
    invoice:
      inv && typeof inv.number === "string" && typeof inv.amount === "number"
        ? { number: inv.number, amount: inv.amount, dueAt: str(inv.dueAt) ?? "" }
        : null,
    request: req && isTariffId(req.tariff) ? { tariff: req.tariff, at: str(req.at) ?? "" } : null,
  };
}

/**
 * Тариф компании (`GET /company/plan`, право `org.manage`) и просьба другого
 * (`POST /company/plan/request`). Переключить тариф сам кабинет не может:
 * его назначает Уклад. Демо без сервера — `null`: там тариф выбирается в
 * браузере.
 */
export const planRepository = {
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
