import type { FulfillmentRequest, RequestStatus } from "../types";
import { isRequest } from "./guards";
import { readList, storePort, type Repository, type StorePort } from "./repository";

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
  ) => Promise<string[]>;
  setStatus: (id: string, status: RequestStatus) => Promise<void>;
  /** Забронировать под ещё не приехавшую поставку. null — бронировать не под что. */
  reserve: (id: string) => Promise<string | null>;
  release: (id: string) => Promise<void>;
}

export function createRequestsRepository(
  port: StorePort = storePort,
): RequestsRepository {
  const all = () => readList(() => port.get().requests, isRequest, "requests");

  return {
    list: all,
    get: async (id) => (await all()).find((r) => r.id === id) ?? null,
    create: async (items, truckDate) => port.get().createRequests(items, truckDate),
    setStatus: async (id, status) => port.get().updateRequestStatus(id, status),
    reserve: async (id) => port.get().reserveRequest(id),
    release: async (id) => port.get().releaseReservation(id),
  };
}

export const requestsRepository = createRequestsRepository();
