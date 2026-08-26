import type {
  Box,
  CellAddress,
  ExpectedShipment,
  Pallet,
  ReceivingEvent,
  ShipmentSource,
} from "../types";
import { isBox, isExpectedShipment, isPallet, isReceivingEvent } from "./guards";
import { readList, storePort, type StorePort } from "./repository";
import type { ReceiveInput } from "../store/state";

/** Приёмка: поставки, факты приёмки, тара и паллеты (п.0.4). */
export interface FulfillmentRepository {
  listShipments: () => Promise<ExpectedShipment[]>;
  getShipment: (id: string) => Promise<ExpectedShipment | null>;
  createShipment: (
    source: ShipmentSource,
    lines: { productId: string; expectedQty: number }[],
    title?: string,
    opts?: { crossDock?: boolean },
  ) => Promise<string>;
  closeShipment: (id: string) => Promise<void>;

  listBoxes: () => Promise<Box[]>;
  listPallets: () => Promise<Pallet[]>;
  listEvents: () => Promise<ReceivingEvent[]>;

  createBox: () => Promise<Box>;
  placeBox: (boxId: string, addr: CellAddress) => Promise<void>;
  createPallet: () => Promise<Pallet>;
  receive: (input: ReceiveInput) => Promise<string>;
}

export function createFulfillmentRepository(
  port: StorePort = storePort,
): FulfillmentRepository {
  const shipments = () =>
    readList(
      () => port.get().expectedShipments,
      isExpectedShipment,
      "expectedShipments",
    );

  return {
    listShipments: shipments,
    getShipment: async (id) => (await shipments()).find((s) => s.id === id) ?? null,
    createShipment: async (source, lines, title, opts) =>
      port.get().createExpectedShipment(source, lines, title, opts),
    closeShipment: async (id) => port.get().closeShipment(id),

    listBoxes: () => readList(() => port.get().boxes, isBox, "boxes"),
    listPallets: () => readList(() => port.get().pallets, isPallet, "pallets"),
    listEvents: () =>
      readList(() => port.get().receivingEvents, isReceivingEvent, "receivingEvents"),

    createBox: async () => port.get().createBox(),
    placeBox: async (boxId, addr) => port.get().placeBox(boxId, addr),
    createPallet: async () => port.get().createPallet(),
    receive: async (input) => port.get().receiveProduct(input),
  };
}

export const fulfillmentRepository = createFulfillmentRepository();
