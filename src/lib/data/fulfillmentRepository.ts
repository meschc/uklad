import type {
  Box,
  CellAddress,
  ExpectedShipment,
  Pallet,
  ReceivingEvent,
  ShipmentSource,
} from "../types";
import { isBox, isExpectedShipment, isPallet, isReceivingEvent } from "./guards";
import { pickOne, readList, storePort, type StorePort } from "./repository";
import { attempt, type Result } from "./result";
import type { ReceiveInput } from "../store/state";

/** Приёмка: поставки, факты приёмки, тара и паллеты (п.0.4). */
export interface FulfillmentRepository {
  listShipments: () => Promise<Result<ExpectedShipment[]>>;
  getShipment: (id: string) => Promise<Result<ExpectedShipment | null>>;
  createShipment: (
    source: ShipmentSource,
    lines: { productId: string; expectedQty: number }[],
    title?: string,
    opts?: { crossDock?: boolean },
  ) => Promise<Result<string>>;
  closeShipment: (id: string) => Promise<Result<void>>;

  listBoxes: () => Promise<Result<Box[]>>;
  listPallets: () => Promise<Result<Pallet[]>>;
  listEvents: () => Promise<Result<ReceivingEvent[]>>;

  createBox: () => Promise<Result<Box>>;
  placeBox: (boxId: string, addr: CellAddress) => Promise<Result<void>>;
  createPallet: () => Promise<Result<Pallet>>;
  attachBox: (boxId: string, palletId: string) => Promise<Result<void>>;
  receive: (input: ReceiveInput) => Promise<Result<string>>;
  /** Кроссдок (п.10.1): закрыть ждавшие заявки. Число — сколько ушло. */
  crossDock: (productId: string, qty: number, shipmentId?: string) => Promise<Result<number>>;
}

export function createFulfillmentRepository(port: StorePort = storePort): FulfillmentRepository {
  const shipments = () =>
    readList(() => port.get().expectedShipments, isExpectedShipment, "expectedShipments");

  return {
    listShipments: shipments,
    getShipment: (id) => pickOne(shipments, (s) => s.id === id),
    createShipment: (source, lines, title, opts) =>
      attempt(() => port.get().createExpectedShipment(source, lines, title, opts)),
    closeShipment: (id) => attempt(() => port.get().closeShipment(id)),

    listBoxes: () => readList(() => port.get().boxes, isBox, "boxes"),
    listPallets: () => readList(() => port.get().pallets, isPallet, "pallets"),
    listEvents: () =>
      readList(() => port.get().receivingEvents, isReceivingEvent, "receivingEvents"),

    createBox: () => attempt(() => port.get().createBox()),
    placeBox: (boxId, addr) => attempt(() => port.get().placeBox(boxId, addr)),
    createPallet: () => attempt(() => port.get().createPallet()),
    attachBox: (boxId, palletId) => attempt(() => port.get().attachBoxToPallet(boxId, palletId)),
    receive: (input) => attempt(() => port.get().receiveProduct(input)),
    crossDock: (productId, qty, shipmentId) =>
      attempt(() => port.get().applyCrossDock(productId, qty, shipmentId)),
  };
}

export const fulfillmentRepository = createFulfillmentRepository();
