import type { FulfillmentRequest, OrderSource, RequestStatus } from "../types";
import type { MsgKey } from "../i18n";
import { selectRole } from "../store/session.slice";
import { apiRequest } from "./api";
import { isRequest } from "./guards";
import { pickOne, readList, storePort, type Repository, type StorePort } from "./repository";
import { attempt, fail, ok, type Result } from "./result";

type NewRequestItem = {
  productId: string;
  qty: number;
  note?: string;
  vehicle?: string;
  source?: OrderSource;
  externalId?: string;
};

/** Заявки продавца и бронь под ожидаемые поставки (п.0.4, п.10.1). */
export interface RequestsRepository extends Repository<FulfillmentRequest> {
  create: (items: NewRequestItem[], truckDate?: number) => Promise<Result<string[]>>;
  setStatus: (id: string, status: RequestStatus) => Promise<Result<void>>;
  /** Забронировать под ещё не приехавшую поставку. null — бронировать не под что. */
  reserve: (id: string) => Promise<Result<string | null>>;
  release: (id: string) => Promise<Result<void>>;
}

/** Отказы сервера на заявку продавца (`sellerRequests.js`) → ключ словаря. */
const SELLER_ERRORS: Record<string, MsgKey> = {
  not_found: "seller.err.notMine",
  short: "seller.err.short",
  duplicate_order: "seller.err.duplicateOrder",
  too_many: "seller.err.tooMany",
  partner: "seller.err.noPartner",
  rate: "seller.err.rate",
};

/**
 * Продавец на сервере заявку не пишет в кабинет сам: шлёт «что и сколько», а
 * заявку собирает сервер (`POST /api/requests`). Ключ повтора — один на
 * нажатие: обрыв связи и повтор не заведут вторую машину. Принятое приходит
 * свежей копией кабинета (`resyncDesk`), как у стола.
 */
async function createOnServer(
  items: NewRequestItem[],
  truckDate: number | undefined,
): Promise<Result<string[]>> {
  const first = items[0];
  const body = {
    key: crypto.randomUUID(),
    items: items.map((it) => ({ productId: it.productId, qty: Math.max(1, Math.round(it.qty)) })),
    note: first?.note?.trim() || undefined,
    vehicle: first?.vehicle?.trim() || undefined,
    truckDate,
    source: first?.source,
    externalId: first?.externalId?.trim() || undefined,
  };
  const res = await attempt(() => apiRequest("POST", "/requests", body), "sync.err.network");
  if (!res.ok) return res;
  const { status, body: reply } = res.data;
  if (status === 402) return fail("plan.err.unpaid");
  if (status !== 200 || !Array.isArray(reply.requests)) {
    return fail(SELLER_ERRORS[String(reply.error)] ?? "data.failed");
  }
  const { resyncDesk } = await import("../store/serverSync");
  await resyncDesk();
  return ok((reply.requests as unknown[]).filter(isRequest).map((r) => r.id));
}

export function createRequestsRepository(port: StorePort = storePort): RequestsRepository {
  const all = () => readList(() => port.get().requests, isRequest, "requests");
  const sellerOnServer = () => {
    const s = port.get();
    return s.session?.source === "server" && selectRole(s) === "seller";
  };

  return {
    list: all,
    get: (id) => pickOne(all, (r) => r.id === id),
    create: (items, truckDate) => {
      const lines = items.filter((it) => it.productId && it.qty > 0);
      if (sellerOnServer()) {
        return lines.length ? createOnServer(lines, truckDate) : Promise.resolve(ok([]));
      }
      return attempt(() => port.get().createRequests(items, truckDate));
    },
    setStatus: (id, status) => attempt(() => port.get().updateRequestStatus(id, status)),
    // Бронь под поставку на сервере — работа склада: заявка продавца ждёт обычным порядком.
    reserve: (id) =>
      sellerOnServer() ? Promise.resolve(ok(null)) : attempt(() => port.get().reserveRequest(id)),
    release: (id) => attempt(() => port.get().releaseReservation(id)),
  };
}

export const requestsRepository = createRequestsRepository();
