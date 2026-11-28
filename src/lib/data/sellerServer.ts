import type { MsgKey } from "../i18n";
import { selectRole } from "../store/session.slice";
import { apiRequest } from "./api";
import type { StorePort } from "./repository";
import { attempt, fail, ok, type Result } from "./result";

/**
 * Продавец на сервере работу склада не пишет в кабинет сам: шлёт операцию
 * («что и сколько»), а запись собирает сервер (`sellerRequests.js`) —
 * заявку, её отмену, поставку «Везу товар». Принятое приходит свежей копией
 * кабинета (`resyncDesk`), как у стола.
 */

/** Вошёл продавец, и кабинет на сервере. */
export function sellerOnServer(port: StorePort): boolean {
  const s = port.get();
  return s.session?.source === "server" && selectRole(s) === "seller";
}

/** Отказы сервера на операции продавца → ключ словаря. */
const SELLER_ERRORS: Record<string, MsgKey> = {
  not_found: "seller.err.notMine",
  short: "seller.err.short",
  duplicate_order: "seller.err.duplicateOrder",
  too_many: "seller.err.tooMany",
  partner: "seller.err.noPartner",
  rate: "seller.err.rate",
  started: "seller.err.started",
  reserved: "seller.err.started",
  not_yours: "seller.err.notYours",
};

/**
 * Операция продавца: ответ 200 — свежая копия кабинета и тело ответа, иначе
 * ключ словаря. Ключ повтора, если нужен, кладёт вызывающий — один на нажатие.
 */
export async function sellerPost(
  path: string,
  body: Record<string, unknown>,
): Promise<Result<Record<string, unknown>>> {
  const res = await attempt(() => apiRequest("POST", path, body), "sync.err.network");
  if (!res.ok) return res;
  const { status, body: reply } = res.data;
  if (status === 402) return fail("plan.err.unpaid");
  if (status !== 200) return fail(SELLER_ERRORS[String(reply.error)] ?? "data.failed");
  const { resyncDesk } = await import("../store/serverSync");
  await resyncDesk();
  return ok(reply);
}
