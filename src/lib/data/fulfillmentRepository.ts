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
import { attempt, fail, ok, type Result } from "./result";
import type { EditorState, ReceiveInput } from "../store/state";
import { nowMs, uid } from "../utils";
import { frozenBoxes } from "../inventory";
import { sellerOnServer, sellerPost } from "./sellerServer";
import { openParcelCheck, parcelCard } from "../parcelCard";

/** «Везу товар» продавца на сервере (`POST /api/supplies`): ключ повтора — один на нажатие. */
async function createSupplyOnServer(
  lines: { productId: string; expectedQty: number }[],
  title: string | undefined,
): Promise<Result<string>> {
  const items = lines
    .filter((l) => l.productId && l.expectedQty > 0)
    .map((l) => ({ productId: l.productId, qty: Math.max(1, Math.round(l.expectedQty)) }));
  if (!items.length) return fail("data.failed");
  const res = await sellerPost("/supplies", {
    key: crypto.randomUUID(),
    title: title?.trim() || undefined,
    items,
  });
  if (!res.ok) return res;
  return isExpectedShipment(res.data.supply) ? ok(res.data.supply.id) : fail("data.failed");
}

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
  /** Вскрыть отменённую посылку в пустую тару: тара с товаром. */
  openParcel: (parcelCode: string, toteCode: string) => Promise<Result<Box>>;
  placeBox: (boxId: string, addr: CellAddress) => Promise<Result<void>>;
  createPallet: () => Promise<Result<Pallet>>;
  attachBox: (boxId: string, palletId: string) => Promise<Result<void>>;
  acceptCargo: (
    input: Parameters<EditorState["acceptCargo"]>[0],
  ) => Promise<Result<{ palletIds: string[]; boxIds: string[] }>>;
  openUnit: (id: string) => Promise<Result<void>>;
  receive: (input: ReceiveInput) => Promise<Result<string>>;
  /** Отменить свой скан приёмки целиком (`recvUndo.ts`); нельзя — `recv.undo.<причина>`. */
  receiveUndo: (scanId: string) => Promise<Result<void>>;
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

  /**
   * Попытка грузовой приёмки, на которую сервер ещё не ответил. Повтор той же
   * формы после обрыва идёт с тем же ключом и событием: если первая попытка
   * дошла, сервер ответит теми же местами, а не заведёт их второй раз.
   */
  /**
   * Тара с нерешённым расхождением инвентаризации заморожена: положить в неё,
   * перенести или поставить на паллету — значит изменить состав, по которому
   * старший будет решать. Отказ до записи, форма остаётся открытой.
   */
  const frozen = (boxId: string) => frozenBoxes(port.get().disputes ?? []).has(boxId);

  let cargoTry: { sig: string; eventId: string; at: number } | null = null;

  return {
    listShipments: shipments,
    getShipment: (id) => pickOne(shipments, (s) => s.id === id),
    createShipment: async (source, lines, title, opts) => {
      // Продавец на сервере «Везу товар» шлёт операцией: поставку собирает сервер.
      if (sellerOnServer(port)) return createSupplyOnServer(lines, title);
      return attempt(() => port.get().createExpectedShipment(source, lines, title, opts));
    },
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
    openParcel: async (parcelCode, toteCode) => {
      const s = port.get();
      // Стол снимок не пишет (ADR 0010): вскрытие — только из кабинета.
      if (s.stationSession?.staffId && onServer(port)) return fail("parcel.open.cabinetOnly");
      const card = parcelCard(parcelCode, {
        outboundBoxes: s.outboundBoxes,
        requests: s.requests,
        products: s.products,
        partners: s.warehouse.partners ?? [],
      });
      const check = openParcelCheck(card, s.boxes, toteCode);
      if (!check.ok) return fail(check.error);
      if (frozen(check.tote.id)) return fail("ws.count.frozen");
      return attempt(() => {
        port.get().openParcel(card!.box.id, check.tote.id);
        return port.get().boxes.find((b) => b.id === check.tote.id)!;
      });
    },
    placeBox: async (boxId, addr) =>
      frozen(boxId)
        ? fail("ws.count.frozen")
        : attempt(() =>
            atDesk(
              () => port.get().placeBox(boxId, addr),
              "recv_place",
              () => ({ boxId, cell: addr }),
            ),
          ),
    createPallet: () => attempt(() => port.get().createPallet()),
    attachBox: async (boxId, palletId) =>
      frozen(boxId)
        ? fail("ws.count.frozen")
        : attempt(() =>
            atDesk(
              () => port.get().attachBoxToPallet(boxId, palletId),
              "recv_attach",
              () => ({ boxId, palletId }),
            ),
          ),
    // Номера мест выдаёт сервер (`recv_cargo`): ярлыки печатают по его
    // ответу, иначе два стола напечатали бы один номер. Без связи — отказ,
    // форма цела и кнопка становится повтором.
    acceptCargo: async (input) => {
      const by = port.get().stationSession?.staffId;
      if (!by || !onServer(port)) return attempt(() => port.get().acceptCargo(input));
      const { shipmentId, pallets, boxes, declaredPallets, declaredBoxes } = input;
      const sig = JSON.stringify([shipmentId, pallets, boxes, declaredPallets, declaredBoxes, by]);
      if (cargoTry?.sig !== sig) cargoTry = { sig, eventId: uid("cargo"), at: nowMs() };
      const { eventId, at } = cargoTry;
      const out = await ops.sendNow(eventId, "recv_cargo", {
        eventId,
        at,
        staffId: by,
        shipmentId,
        pallets,
        boxes,
        ...(declaredPallets !== undefined ? { declaredPallets } : {}),
        ...(declaredBoxes !== undefined ? { declaredBoxes } : {}),
      });
      if (out.kind === "local") return attempt(() => port.get().acceptCargo(input));
      if (out.kind === "fail") return fail("data.failed");
      cargoTry = null;
      const made = out.result.made;
      if (out.result.status !== "applied" || !made) return fail("cargo.rejected");
      return attempt(() => port.get().acceptCargo({ ...input, made, at }));
    },
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
    receive: async (input) =>
      frozen(input.boxId)
        ? fail("ws.count.frozen")
        : attempt(() =>
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
                  ...(input.defect ? { defect: true } : {}),
                };
              },
            ),
          ),
    receiveUndo: async (scanId) => {
      const by = port.get().stationSession?.staffId ?? port.get().receiving.staffId;
      if (!by) return fail("recv.undo.not_yours");
      const res = await attempt(() => port.get().undoReceive(scanId, by));
      if (!res.ok) return res;
      const out = res.data;
      if ("problem" in out) return fail(`recv.undo.${out.problem}` as const);
      if (port.get().stationSession?.staffId && onServer(port)) {
        ops.enqueue("recv_undo", { eventId: out.id, staffId: by, at: out.at, undoes: scanId });
      }
      return ok(undefined);
    },
    crossDock: (productId, qty, shipmentId, boxId) =>
      attempt(() => port.get().applyCrossDock(productId, qty, shipmentId, boxId)),
  };
}

export const fulfillmentRepository = createFulfillmentRepository();
