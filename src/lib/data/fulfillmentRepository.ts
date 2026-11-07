import type {
  Box,
  CellAddress,
  ExpectedShipment,
  Pallet,
  ReceivingEvent,
  ShipmentSource,
} from "../types";
import { onServer } from "./badgeRepository";
import { isBox, isExpectedShipment, isPallet, isReceivingEvent } from "./guards";
import { deskOps, type DeskOpBody, type DeskOpKind, type OpQueue } from "./opQueue";
import { pickOne, readList, storePort, type StorePort } from "./repository";
import { attempt, type Result } from "./result";
import type { EditorState, ReceiveInput } from "../store/state";
import { nowMs, uid } from "../utils";

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
  markLabelsPrinted: (kind: "box" | "pallet", codes: string[]) => Promise<Result<void>>;
  placeBox: (boxId: string, addr: CellAddress) => Promise<Result<void>>;
  createPallet: () => Promise<Result<Pallet>>;
  attachBox: (boxId: string, palletId: string) => Promise<Result<void>>;
  acceptCargo: (
    input: Parameters<EditorState["acceptCargo"]>[0],
  ) => Promise<Result<{ palletIds: string[]; boxIds: string[] }>>;
  openUnit: (id: string) => Promise<Result<void>>;
  receive: (input: ReceiveInput) => Promise<Result<string>>;
  /** Кроссдок (п.10.1): закрыть ждавшие заявки. Число — сколько ушло. */
  crossDock: (
    productId: string,
    qty: number,
    shipmentId?: string,
    boxId?: string,
  ) => Promise<Result<number>>;
}

export function createFulfillmentRepository(
  port: StorePort = storePort,
  ops: OpQueue = deskOps,
): FulfillmentRepository {
  const shipments = () =>
    readList(() => port.get().expectedShipments, isExpectedShipment, "expectedShipments");

  /**
   * Приёмка со стола на сервере уходит операциями (`cabinet/deskReceive.js`):
   * стор уже записал факт, очередь донесёт его с ключом повтора. В кабинете
   * руководителя и в демо очереди нет — там пишет снимок.
   */
  const atDesk = <T>(
    act: () => T,
    kind: DeskOpKind,
    body: (out: T) => Omit<DeskOpBody, "staffId" | "at" | "eventId"> & {
      eventId?: string;
      at?: number;
    },
  ): T => {
    const out = act();
    const by = port.get().stationSession?.staffId;
    if (by && onServer(port)) {
      const { at, eventId, ...rest } = body(out);
      ops.enqueue(kind, { ...rest, eventId: eventId ?? uid("rc"), at: at ?? nowMs(), staffId: by });
    }
    return out;
  };

  return {
    listShipments: shipments,
    getShipment: (id) => pickOne(shipments, (s) => s.id === id),
    createShipment: (source, lines, title, opts) =>
      attempt(() => port.get().createExpectedShipment(source, lines, title, opts)),
    closeShipment: (id) =>
      attempt(() =>
        atDesk(
          () => port.get().closeShipment(id),
          "recv_close",
          () => ({ shipmentId: id }),
        ),
      ),

    listBoxes: () => readList(() => port.get().boxes, isBox, "boxes"),
    listPallets: () => readList(() => port.get().pallets, isPallet, "pallets"),
    listEvents: () =>
      readList(() => port.get().receivingEvents, isReceivingEvent, "receivingEvents"),

    createBox: () => attempt(() => port.get().createBox()),
    markLabelsPrinted: (kind, codes) => attempt(() => port.get().markLabelsPrinted(kind, codes)),
    placeBox: (boxId, addr) =>
      attempt(() =>
        atDesk(
          () => port.get().placeBox(boxId, addr),
          "recv_place",
          () => ({ boxId, cell: addr }),
        ),
      ),
    createPallet: () => attempt(() => port.get().createPallet()),
    attachBox: (boxId, palletId) =>
      attempt(() =>
        atDesk(
          () => port.get().attachBoxToPallet(boxId, palletId),
          "recv_attach",
          () => ({ boxId, palletId }),
        ),
      ),
    acceptCargo: (input) => attempt(() => port.get().acceptCargo(input)),
    openUnit: (id) =>
      attempt(() =>
        atDesk(
          () => port.get().openUnit(id),
          "recv_open",
          () => ({ unitId: id }),
        ),
      ),
    // Кроссдок на сервере решает поставка внутри `recv_unit`: отдельной
    // операции у него нет.
    receive: (input) =>
      attempt(() =>
        atDesk(
          () => port.get().receiveProduct(input),
          "recv_unit",
          (id) => {
            const ev = port.get().receivingEvents.find((e) => e.id === id);
            return {
              eventId: id,
              at: ev?.timestamp,
              productId: input.productId,
              qty: ev?.qty ?? input.qty,
              boxId: input.boxId,
              shipmentId: input.shipmentId,
              lineId: input.lineId,
              discrepancy: input.discrepancy,
            };
          },
        ),
      ),
    crossDock: (productId, qty, shipmentId, boxId) =>
      attempt(() => port.get().applyCrossDock(productId, qty, shipmentId, boxId)),
  };
}

export const fulfillmentRepository = createFulfillmentRepository();
