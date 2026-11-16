import type { PayAdjustment } from "../types";
import { storePort, type StorePort } from "./repository";
import { attempt, fail, type Result } from "./result";

/**
 * Корректировки оплаты сотрудника (удержания, премии, надбавки). Пишет только
 * тот, у кого «Персонал» (`staff.manage`): сервер держит список в строках
 * кабинета, а запись кабинета ему одному и разрешена (`writeScope.js`).
 */
type PayInput = Omit<PayAdjustment, "id" | "createdAt" | "by">;

/** Самая большая сумма одной корректировки: опечатка в лишний ноль — не зарплата. */
const MAX_AMOUNT = 10_000_000;

export function createPayRepository(port: StorePort = storePort) {
  return {
    add: (input: PayInput): Promise<Result<string>> => {
      const amount = Math.round(input.amount);
      if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT)
        return Promise.resolve(fail("pay.err.amount"));
      if (!input.reason.trim()) return Promise.resolve(fail("pay.err.reason"));
      return attempt(() => port.get().addPayAdjustment({ ...input, amount }));
    },
    remove: (id: string): Promise<Result<void>> =>
      attempt(() => port.get().removePayAdjustment(id)),
  };
}

export const payRepository = createPayRepository();
