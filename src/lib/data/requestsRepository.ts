import type { FulfillmentRequest, OrderSource, RequestStatus } from "../types";
import { isRequest } from "./guards";
import { pickOne, readList, storePort, type Repository, type StorePort } from "./repository";
import { attempt, fail, ok, type Result } from "./result";
import { sellerOnServer, sellerPost } from "./sellerServer";

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

/** Заявка продавца на сервере (`POST /api/requests`): ключ повтора — один на нажатие. */
async function createOnServer(
  items: NewRequestItem[],
  truckDate: number | undefined,
): Promise<Result<string[]>> {
  const first = items[0];
  const res = await sellerPost("/requests", {
    key: crypto.randomUUID(),
    items: items.map((it) => ({ productId: it.productId, qty: Math.max(1, Math.round(it.qty)) })),
    note: first?.note?.trim() || undefined,
    vehicle: first?.vehicle?.trim() || undefined,
    truckDate,
    source: first?.source,
    externalId: first?.externalId?.trim() || undefined,
  });
  if (!res.ok) return res;
  const made = Array.isArray(res.data.requests) ? (res.data.requests as unknown[]) : [];
  return ok(made.filter(isRequest).map((r) => r.id));
}

/** Продавец отменяет свою новую заявку (`POST /api/requests/cancel`). */
async function cancelOnServer(id: string): Promise<Result<void>> {
  const res = await sellerPost("/requests/cancel", { id });
  return res.ok ? ok(undefined) : res;
}

export function createRequestsRepository(port: StorePort = storePort): RequestsRepository {
  const all = () => readList(() => port.get().requests, isRequest, "requests");
  const seller = () => sellerOnServer(port);

  return {
    list: all,
    get: (id) => pickOne(all, (r) => r.id === id),
    create: (items, truckDate) => {
      const lines = items.filter((it) => it.productId && it.qty > 0);
      if (seller()) {
        return lines.length ? createOnServer(lines, truckDate) : Promise.resolve(ok([]));
      }
      return attempt(() => port.get().createRequests(items, truckDate));
    },
    setStatus: (id, status) => {
      // Продавцу на сервере из статусов доступна только отмена своей заявки.
      if (seller()) {
        return status === "cancelled" ? cancelOnServer(id) : Promise.resolve(fail("data.failed"));
      }
      return attempt(() => port.get().updateRequestStatus(id, status));
    },
    // Бронь под поставку на сервере — работа склада: заявка продавца ждёт обычным порядком.
    reserve: (id) =>
      seller() ? Promise.resolve(ok(null)) : attempt(() => port.get().reserveRequest(id)),
    release: (id) => attempt(() => port.get().releaseReservation(id)),
  };
}

export const requestsRepository = createRequestsRepository();
