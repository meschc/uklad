import type { ReceivingAnswer } from "../types";
import { nowMs } from "../utils";
import { apiRequest } from "./api";
import { onServer } from "./badgeRepository";
import { storePort, type StorePort } from "./repository";
import { attempt, fail, ok, type Result } from "./result";
import { answerState } from "../supplyAct";

/**
 * Ответ продавца на акт расхождений приёмки и решение старшего по
 * возражению (Кирилл 17.11). На сервере — таблица (миграция 048,
 * `receivingAnswers.js`): сервер сам проверяет, что поставка продавца,
 * закрыта и срок не вышел. В демо ответы живут в сторе до перезагрузки, и
 * кабинет склада в той же вкладке видит их сразу.
 */
const ERRORS: Record<
  string,
  "supply.act.err.late" | "supply.act.err.answered" | "supply.act.err.resolved"
> = {
  late: "supply.act.err.late",
  answered: "supply.act.err.answered",
  resolved: "supply.act.err.resolved",
};

function isAnswer(v: unknown): v is ReceivingAnswer {
  if (typeof v !== "object" || v === null) return false;
  const a = v as Record<string, unknown>;
  return (
    typeof a.shipmentId === "string" &&
    typeof a.partnerId === "string" &&
    (a.answer === "agree" || a.answer === "dispute") &&
    typeof a.answeredAt === "number"
  );
}

export function createReceivingAnswersRepository(port: StorePort = storePort) {
  const put = (a: ReceivingAnswer) =>
    port.set({
      receivingAnswers: [
        a,
        ...(port.get().receivingAnswers ?? []).filter(
          (x) => x.shipmentId !== a.shipmentId || x.partnerId !== a.partnerId,
        ),
      ],
    });
  const local = (id: string, partner: string) =>
    (port.get().receivingAnswers ?? []).find((a) => a.shipmentId === id && a.partnerId === partner);

  /** Ответ сервера → запись в сторе или ключ отказа. */
  const fromServer = async (
    path: string,
    body: Record<string, unknown>,
  ): Promise<Result<ReceivingAnswer>> => {
    const res = await attempt(() => apiRequest("POST", path, body), "sync.err.network");
    if (!res.ok) return res;
    const { status, body: reply } = res.data;
    if (status === 200 && isAnswer(reply.answer)) {
      put(reply.answer);
      return ok(reply.answer);
    }
    return fail(ERRORS[String(reply.error)] ?? "data.failed");
  };

  return {
    /** Забрать ответы с сервера в стор. В демо — то, что уже есть. */
    load: async (): Promise<Result<void>> => {
      if (!onServer(port)) return ok(undefined);
      const res = await attempt(() => apiRequest("GET", "/receiving/answers"), "sync.err.network");
      if (!res.ok) return res;
      const { status, body } = res.data;
      // Ответы не положены этому входу — экран без них, а не ошибка.
      if (status === 403) return ok(undefined);
      if (status !== 200 || !Array.isArray(body.answers)) return fail("sync.err.network");
      port.set({ receivingAnswers: (body.answers as unknown[]).filter(isAnswer) });
      return ok(undefined);
    },

    /** Продавец: согласен или не согласен (с комментарием) — один раз. */
    answer: async (
      shipmentId: string,
      answer: ReceivingAnswer["answer"],
      comment: string,
    ): Promise<Result<ReceivingAnswer>> => {
      const text = comment.trim();
      if (answer === "dispute" && !text) return fail("supply.act.err.comment");
      if (onServer(port)) {
        return fromServer("/receiving/answers", { shipmentId, answer, comment: text });
      }
      const s = port.get();
      const shipment = s.expectedShipments.find((x) => x.id === shipmentId);
      if (!shipment) return fail("data.failed");
      const partnerId = s.session.user.partnerId ?? "";
      if (local(shipmentId, partnerId)) return fail("supply.act.err.answered");
      if (answerState(shipment, undefined, nowMs()) !== "open") return fail("supply.act.err.late");
      const a: ReceivingAnswer = {
        shipmentId,
        partnerId,
        answer,
        ...(text ? { comment: text } : {}),
        answeredAt: nowMs(),
      };
      put(a);
      return ok(a);
    },

    /** Старший: ответ на возражение — учёт верный или пересчитаем. */
    resolve: async (
      shipmentId: string,
      partnerId: string,
      resolution: NonNullable<ReceivingAnswer["resolution"]>,
      reply: string,
    ): Promise<Result<ReceivingAnswer>> => {
      const text = reply.trim();
      if (!text) return fail("supply.act.err.reply");
      if (onServer(port)) {
        return fromServer("/receiving/answers/resolve", {
          shipmentId,
          partnerId,
          resolution,
          reply: text,
        });
      }
      const a = local(shipmentId, partnerId);
      if (!a || a.answer !== "dispute" || a.resolution) return fail("supply.act.err.resolved");
      const done = { ...a, resolution, reply: text, resolvedAt: nowMs() };
      put(done);
      return ok(done);
    },
  };
}

export const receivingAnswersRepository = createReceivingAnswersRepository();
