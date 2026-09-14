import type { FulfillmentRequest, RequestStatus } from "../types";
import { isRequest } from "./guards";
import { pickOne, readList, storePort, type Repository, type StorePort } from "./repository";
import { attempt, type Result } from "./result";

/** Заявки продавца и бронь под ожидаемые поставки (п.0.4, п.10.1). */
export interface RequestsRepository extends Repository<FulfillmentRequest> {
  create: (
    items: {
      productId: string;
      qty: number;
      note?: string;
      vehicle?: string;
      kitId?: string;
    }[],
    truckDate?: number,
  ) => Promise<Result<string[]>>;
  setStatus: (id: string, status: RequestStatus) => Promise<Result<void>>;
  /** Забронировать под ещё не приехавшую поставку. null — бронировать не под что. */
  reserve: (id: string) => Promise<Result<string | null>>;
  release: (id: string) => Promise<Result<void>>;
}

export function createRequestsRepository(port: StorePort = storePort): RequestsRepository {
  const all = () => readList(() => port.get().requests, isRequest, "requests");

  return {
    list: all,
    get: (id) => pickOne(all, (r) => r.id === id),
    create: (items, truckDate) => attempt(() => port.get().createRequests(items, truckDate)),
    setStatus: (id, status) => attempt(() => port.get().updateRequestStatus(id, status)),
    reserve: (id) => attempt(() => port.get().reserveRequest(id)),
    release: (id) => attempt(() => port.get().releaseReservation(id)),
  };
}

export const requestsRepository = createRequestsRepository();
