import { describe, expect, it, vi } from "vitest";
import type { EditorState } from "../../store/state";
import type { ExpectedShipment, ReceivingAnswer } from "../../types";
import type { StorePort } from "../repository";
import { createReceivingAnswersRepository } from "../receivingAnswersRepository";
import { ANSWER_DAYS, answerState } from "../../supplyAct";

const DAY = 24 * 3_600_000;
const NOW = 1_800_000_000_000;

const shipment = (over: Partial<ExpectedShipment> = {}): ExpectedShipment => ({
  id: "sh1",
  source: "manual",
  lines: [{ id: "l1", productId: "p1", expectedQty: 10, receivedQty: 5 }],
  createdAt: NOW - 2 * DAY,
  status: "closed",
  closedAt: NOW - DAY,
  ...over,
});

/** Демо: стор в памяти, без сервера. */
function setup(shipments: ExpectedShipment[] = [shipment()]) {
  let state = {
    session: { source: "local", user: { partnerId: "pa" } },
    expectedShipments: shipments,
    receivingAnswers: [] as ReceivingAnswer[],
  } as unknown as EditorState;
  const port: StorePort = {
    get: () => state,
    set: (patch) => {
      state = { ...state, ...(patch as Partial<EditorState>) };
    },
  };
  return {
    repo: createReceivingAnswersRepository(port),
    answers: () => state.receivingAnswers,
    as: (partnerId: string) => {
      state = { ...state, session: { ...state.session, user: { partnerId } } } as EditorState;
    },
  };
}

describe("ответ продавца на акт приёмки", () => {
  it("согласие пишется один раз, второй ответ — отказ", async () => {
    vi.setSystemTime(NOW);
    const { repo, answers } = setup();
    const res = await repo.answer("sh1", "agree", "");
    expect(res.ok && res.data).toMatchObject({
      shipmentId: "sh1",
      partnerId: "pa",
      answer: "agree",
    });
    expect(await repo.answer("sh1", "dispute", "пришло 10")).toEqual({
      ok: false,
      error: "supply.act.err.answered",
    });
    expect(answers()).toHaveLength(1);
  });

  it("в смешанной поставке каждый продавец отвечает за свои строки", async () => {
    vi.setSystemTime(NOW);
    const { repo, answers, as } = setup();
    await repo.answer("sh1", "dispute", "пришло 10");
    as("pb");
    expect((await repo.answer("sh1", "agree", "")).ok).toBe(true);
    expect(answers().map((a) => [a.partnerId, a.answer])).toEqual([
      ["pb", "agree"],
      ["pa", "dispute"],
    ]);
  });

  it("несогласие без комментария не уходит", async () => {
    const { repo, answers } = setup();
    expect(await repo.answer("sh1", "dispute", "  ")).toEqual({
      ok: false,
      error: "supply.act.err.comment",
    });
    expect(answers()).toHaveLength(0);
  });

  it("после трёх суток с закрытия ответить нельзя: молчание — согласие", async () => {
    vi.setSystemTime(NOW);
    const { repo } = setup([shipment({ closedAt: NOW - (ANSWER_DAYS + 1) * DAY })]);
    expect(await repo.answer("sh1", "agree", "")).toEqual({
      ok: false,
      error: "supply.act.err.late",
    });
  });

  it("старший отвечает на возражение один раз", async () => {
    vi.setSystemTime(NOW);
    const { repo, answers } = setup();
    await repo.answer("sh1", "dispute", "отгрузили 10, есть накладная");
    expect((await repo.resolve("sh1", "pa", "recount", "")).ok).toBe(false);
    const res = await repo.resolve("sh1", "pa", "recount", "пересчитаем завтра");
    expect(res.ok && res.data).toMatchObject({
      resolution: "recount",
      reply: "пересчитаем завтра",
    });
    expect(await repo.resolve("sh1", "pa", "kept", "ещё раз")).toEqual({
      ok: false,
      error: "supply.act.err.resolved",
    });
    expect(answers()[0].resolution).toBe("recount");
  });
});

describe("answerState", () => {
  const s = shipment();
  it("открытая поставка ещё не ждёт ответа", () => {
    expect(answerState(shipment({ status: "receiving" }), undefined, NOW)).toBe("waiting");
  });
  it("срок идёт — открыт, вышел — принят молчанием", () => {
    expect(answerState(s, undefined, NOW)).toBe("open");
    expect(answerState(s, undefined, NOW + ANSWER_DAYS * DAY)).toBe("silent");
  });
  it("ответ важнее срока", () => {
    const a: ReceivingAnswer = {
      shipmentId: "sh1",
      partnerId: "pa",
      answer: "dispute",
      answeredAt: NOW,
    };
    expect(answerState(s, a, NOW + 10 * DAY)).toBe("disputed");
    expect(answerState(s, { ...a, resolution: "kept" }, NOW)).toBe("resolved");
    expect(answerState(s, { ...a, answer: "agree" }, NOW)).toBe("agreed");
  });
});
