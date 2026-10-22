/**
 * «Честный знак» (ГИС МТ, True API оператора ЦРПТ).
 *
 * Доступ к API выдаётся только по запросу, подписанному УКЭП участника
 * оборота: сервер берёт у ГИС МТ случайную строку (`/auth/key`), её
 * подписывают, в обмен приходит токен примерно на 10 часов. Подписывает НЕ
 * Уклад: закрытый ключ селлера или склада остаётся у них (плагин КриптоПро в
 * браузере). Поэтому подпись — отдельный порт `MarkSigner`, а не код сервера.
 *
 * Что заложено: проверка кодов (`marks.verify`) — статус, GTIN и ИНН
 * владельца, чтобы на приёмке не принять чужой или выбывший товар. Ввод в
 * оборот, агрегация и документы — операции владельца товара, в Уклад не
 * закладываются до решения, кто их подписывает.
 */

import { fail, ok, type Result } from "../data/result";
import { parseMarkingCode } from "../markingCode";
import type { ConnectorTransport } from "./transport";
import type { Connector, MarkCheck, MarkStatus } from "./types";

/** Подпись строки-вызова ГИС МТ: base64 откреплённой подписи УКЭП. */
export interface MarkSigner {
  sign(data: string): Promise<Result<string>>;
}

const STATUS: Record<string, MarkStatus> = {
  EMITTED: "emitted",
  APPLIED: "applied",
  INTRODUCED: "introduced",
  RETIRED: "retired",
  WRITTEN_OFF: "retired",
  DISAGGREGATION: "retired",
};

/** Ответ `POST /api/v4/true-api/cises/info` → проверки в общей форме. */
export function mapCisesInfo(payload: unknown): MarkCheck[] {
  if (!Array.isArray(payload)) return [];
  return payload
    .map((row) => (row as { cisInfo?: Record<string, unknown> })?.cisInfo)
    .filter((i): i is Record<string, unknown> => !!i && typeof i.cis === "string")
    .map((i) => ({
      cis: i.cis as string,
      status: STATUS[String(i.status)] ?? "unknown",
      gtin: typeof i.gtin === "string" ? i.gtin : undefined,
      ownerInn: typeof i.ownerInn === "string" ? i.ownerInn : undefined,
    }));
}

/**
 * Получить токен ГИС МТ: строка от сервера → подпись пользователя → токен.
 * Сервер сохраняет токен у подключения и дальше подставляет сам.
 */
export async function signInHonestSign(
  transport: ConnectorTransport,
  account: string,
  signer: MarkSigner,
): Promise<Result<void>> {
  const key = await transport.request({
    system: "honest-sign",
    account,
    method: "GET",
    path: "/api/v3/true-api/auth/key",
  });
  if (!key.ok) return key;
  const { uuid, data } = (key.data ?? {}) as { uuid?: string; data?: string };
  if (!uuid || !data) return fail("data.failed");
  const signed = await signer.sign(data);
  if (!signed.ok) return signed;
  const res = await transport.request({
    system: "honest-sign",
    account,
    method: "POST",
    path: "/api/v3/true-api/auth/simpleSignIn",
    body: { uuid, data: signed.data },
  });
  return res.ok ? ok(undefined) : res;
}

export function createHonestSignConnector(
  transport: ConnectorTransport,
  account: string,
): Connector {
  return {
    system: "honest-sign",
    capabilities: ["marks.verify"],

    async verifyMarks(codes): Promise<Result<MarkCheck[]>> {
      // В ГИС МТ уходит код без криптохвоста; неразобранные строки не шлём.
      const cis = codes.map((c) => parseMarkingCode(c)?.cis).filter((c): c is string => !!c);
      if (cis.length === 0) return ok([]);
      const res = await transport.request({
        system: "honest-sign",
        account,
        method: "POST",
        path: "/api/v4/true-api/cises/info",
        body: cis,
      });
      return res.ok ? ok(mapCisesInfo(res.data)) : res;
    },
  };
}
