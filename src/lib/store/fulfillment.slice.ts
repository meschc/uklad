import { nowMs, uid } from "../utils";
import { generateBoxBarcode, generatePalletBarcode } from "../barcode";
import { EMPTY_RECEIVING, resumeProgress } from "../receiving";
import type { Box, ExpectedShipment, Pallet, ReceivingEvent } from "../types";
import type { FulfillmentSlice, SliceCreator } from "./state";

/**
 * Приёмка: ожидаемые поставки, факты приёмки, коробки и паллеты.
 *
 * Главный принцип (уточнён пользователем): приёмка — это СВЕРКА факта с
 * ожиданием, а не поштучное сканирование. Сканируется одна единица, чтобы
 * опознать артикул; количество вводится руками и сверяется с остатком строки
 * поставки. Расхождение не блокирует приёмку, но и не проваливается молча —
 * оператор либо пересчитывает, либо явно записывает недостачу/перестачу.
 */
export const createFulfillmentSlice: SliceCreator<FulfillmentSlice> = (set, get) => ({
  expectedShipments: [],
  receivingEvents: [],
  boxes: [],
  pallets: [],
  boxSeq: 0,
  palletSeq: 0,

  createExpectedShipment: (source, lines, title, opts) => {
    const shipment: ExpectedShipment = {
      id: uid("ship"),
      source,
      title: title?.trim() || undefined,
      createdAt: nowMs(),
      status: "pending",
      crossDock: opts?.crossDock || undefined,
      lines: lines
        .filter((l) => l.productId && l.expectedQty > 0)
        .map((l) => ({
          id: uid("shipline"),
          productId: l.productId,
          expectedQty: Math.round(l.expectedQty),
          receivedQty: 0,
        })),
    };
    set((s) => ({ expectedShipments: [shipment, ...s.expectedShipments] }));
    return shipment.id;
  },

  setShipmentStatus: (id, status) =>
    set((s) => ({
      expectedShipments: s.expectedShipments.map((sh) => (sh.id === id ? { ...sh, status } : sh)),
    })),

  setCrossDock: (id, on) =>
    set((s) => ({
      expectedShipments: s.expectedShipments.map((sh) =>
        sh.id === id ? { ...sh, crossDock: on || undefined } : sh,
      ),
    })),

  closeShipment: (id) =>
    set((s) => ({
      expectedShipments: s.expectedShipments.map((sh) =>
        sh.id === id ? { ...sh, status: "closed", closedAt: nowMs() } : sh,
      ),
    })),

  /**
   * Один подтверждённый факт приёмки. Пишем три вещи разом, одним `set`:
   * строку в коробку, прирост `receivedQty` у строки поставки и событие. Иначе
   * отмена откатывала бы приёмку по частям, а метрики дашборда ловили бы
   * промежуточное состояние.
   */
  receiveProduct: ({ productId, qty, boxId, shipmentId, lineId, staffId, discrepancy }) => {
    const n = Math.max(1, Math.round(qty));
    const event: ReceivingEvent = {
      id: uid("recv"),
      productId,
      qty: n,
      boxId,
      staffId,
      timestamp: nowMs(),
      expectedShipmentLineId: lineId,
      discrepancy,
    };

    set((s) => ({
      boxes: s.boxes.map((b) => {
        if (b.id !== boxId) return b;
        const idx = b.lines.findIndex((l) => l.productId === productId);
        const lines =
          idx >= 0
            ? b.lines.map((l, i) => (i === idx ? { ...l, qty: l.qty + n } : l))
            : [...b.lines, { productId, qty: n }];
        return { ...b, lines };
      }),
      expectedShipments: s.expectedShipments.map((sh) => {
        if (sh.id !== shipmentId) return sh;
        return {
          ...sh,
          // Поставка, по которой начали принимать, переходит в «идёт приёмка».
          status: sh.status === "pending" ? "receiving" : sh.status,
          lines: sh.lines.map((l) =>
            l.id === lineId ? { ...l, receivedQty: l.receivedQty + n } : l,
          ),
        };
      }),
      receivingEvents: [...s.receivingEvents, event],
    }));

    return event.id;
  },

  createBox: () => {
    const seq = get().boxSeq + 1;
    const box: Box = {
      id: uid("box"),
      barcode: generateBoxBarcode(seq),
      createdAt: nowMs(),
      lines: [],
    };
    set((s) => ({ boxes: [...s.boxes, box], boxSeq: seq }));
    return box;
  },

  placeBox: (boxId, addr) =>
    set((s) => ({
      boxes: s.boxes.map((b) => (b.id === boxId ? { ...b, address: addr } : b)),
    })),

  createPallet: () => {
    const seq = get().palletSeq + 1;
    const pallet: Pallet = {
      id: uid("plt"),
      barcode: generatePalletBarcode(seq),
      createdAt: nowMs(),
      boxIds: [],
    };
    set((s) => ({ pallets: [...s.pallets, pallet], palletSeq: seq }));
    return pallet;
  },

  attachBoxToPallet: (boxId, palletId) =>
    set((s) => ({
      boxes: s.boxes.map((b) => (b.id === boxId ? { ...b, palletId } : b)),
      pallets: s.pallets.map((p) => {
        if (p.id !== palletId) return p;
        return p.boxIds.includes(boxId) ? p : { ...p, boxIds: [...p.boxIds, boxId] };
      }),
    })),

  /**
   * Снять товар с коробки при сборке. Занятость должна уменьшаться так же
   * честно, как росла при приёмке: опустевшая строка удаляется, и пустая
   * коробка перестаёт занимать ячейку в `buildOccupancy` (см. 2.1).
   */
  removeFromBox: (boxId, productId, qty) => {
    const box = get().boxes.find((b) => b.id === boxId);
    const line = box?.lines.find((l) => l.productId === productId);
    if (!line) return 0;
    const take = Math.min(line.qty, Math.max(1, Math.round(qty)));
    set((s) => ({
      boxes: s.boxes.map((b) => {
        if (b.id !== boxId) return b;
        return {
          ...b,
          lines: b.lines
            .map((l) => (l.productId === productId ? { ...l, qty: l.qty - take } : l))
            .filter((l) => l.qty > 0),
        };
      }),
    }));
    return take;
  },

  // --- ход мастера приёмки (п.4.7) ------------------------------------------

  receiving: EMPTY_RECEIVING,

  setReceiving: (patch) => set((s) => ({ receiving: { ...s.receiving, ...patch } })),

  addReceived: (qty) =>
    set((s) => ({ receiving: { ...s.receiving, received: s.receiving.received + qty } })),

  resumeReceiving: () => set((s) => ({ receiving: resumeProgress(s.receiving, s) })),
});
