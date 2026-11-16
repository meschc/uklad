import { describe, expect, it, vi } from "vitest";
import type { EditorState } from "../../store/state";
import type { StorePort } from "../repository";
import { createPayRepository } from "../payRepository";

/** Корректировки оплаты: понятная ошибка до стора, в стор — целые рубли. */
function setup() {
  const addPayAdjustment = vi.fn(() => "pay_1");
  const removePayAdjustment = vi.fn();
  const port: StorePort = {
    get: () => ({ addPayAdjustment, removePayAdjustment }) as unknown as EditorState,
    set: () => {},
  };
  return { repo: createPayRepository(port), addPayAdjustment, removePayAdjustment };
}

const input = { staffId: "s1", kind: "deduction" as const, amount: 300, reason: "брак", at: 1 };

describe("createPayRepository", () => {
  it("сумма округляется до рубля и уходит в стор", async () => {
    const { repo, addPayAdjustment } = setup();
    const res = await repo.add({ ...input, amount: 299.6 });
    expect(res).toEqual({ ok: true, data: "pay_1" });
    expect(addPayAdjustment).toHaveBeenCalledWith({ ...input, amount: 300 });
  });

  it("ноль, минус и опечатка в лишние нули — отказ с понятной ошибкой", async () => {
    const { repo, addPayAdjustment } = setup();
    for (const amount of [0, -5, Number.NaN, 100_000_000]) {
      expect(await repo.add({ ...input, amount })).toEqual({ ok: false, error: "pay.err.amount" });
    }
    expect(addPayAdjustment).not.toHaveBeenCalled();
  });

  it("без причины — отказ", async () => {
    const { repo } = setup();
    expect(await repo.add({ ...input, reason: "  " })).toEqual({
      ok: false,
      error: "pay.err.reason",
    });
  });

  it("удаление — по id", async () => {
    const { repo, removePayAdjustment } = setup();
    expect((await repo.remove("pay_1")).ok).toBe(true);
    expect(removePayAdjustment).toHaveBeenCalledWith("pay_1");
  });
});
