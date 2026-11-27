import { uid } from "../utils";
import { generateBoxBarcode } from "../barcode";
import { addressKey } from "../address";
import { allCells, buildOccupancy } from "../placement";
import type {
  Box,
  CellAddress,
  ExpectedShipment,
  ExpectedShipmentLine,
  FulfillmentRequest,
  Product,
  ReceivingEvent,
  Shipment,
  StaffMember,
  Warehouse,
} from "../types";
import { DAY, DESTINATIONS, SUPPLIERS, VEHICLES, dayStart, fmtDate, rng } from "./seedHistory";

/**
 * Месяц работы демо-склада (Кирилл 24.11: «наполним его, прям такой хороший,
 * основательный»; 27.11 — склад на 60–70% и история за месяц).
 *
 * `seedHistory` даёт два с половиной месяца редких событий: этого хватает,
 * чтобы экраны не были пустыми, но склад занят на 18%, а за месяц в аналитике
 * всего несколько рейсов. Здесь — обычный рабочий месяц фулфилмента:
 *   · пополнение по будням — партии от поставщиков, каждая позиция ложится
 *     в свои короба (один товар в коробе — так хранят запас) на свободные
 *     ячейки, пока склад не займёт ~66%;
 *   · отгрузки каждый будний день — заявки на то, что лежит в этих коробах.
 *
 * Учёт сходится, как в книге `ledger.ts`: уехавшее вычитается из коробов,
 * короб никогда не пустеет до нуля. Пришло = в коробах + уехало.
 *
 * Свой генератор с фиксированным зерном: история `seedHistory` не сдвигается.
 */

/** Сколько ячеек склада должно быть занято после посева. */
const TARGET_FILL = 0.66;
/** Глубина истории в днях. */
const MONTH_DAYS = 30;

export interface SeededMonth {
  expectedShipments: ExpectedShipment[];
  receivingEvents: ReceivingEvent[];
  boxes: Box[];
  boxSeq: number;
  requests: FulfillmentRequest[];
  shipments: Shipment[];
}

interface Base {
  boxes: Box[];
  boxSeq: number;
  placements: Record<string, CellAddress>;
}

export function seedMonth(
  warehouse: Warehouse,
  products: Product[],
  base: Base,
  now: number,
): SeededMonth {
  const out: SeededMonth = {
    expectedShipments: [],
    receivingEvents: [],
    boxes: [],
    boxSeq: base.boxSeq,
    requests: [],
    shipments: [],
  };
  if (!products.length) return out;

  const rand = rng(20261127);
  const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
  const between = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

  const staff = warehouse.staff ?? [];
  const receivers = staff.filter((s) => /приём|кладов/i.test(s.role));
  const pickers = staff.filter((s) => /комплект|кладов/i.test(s.role));
  const staffId = (pool: StaffMember[]) => (pool.length ? pick(pool).id : undefined);

  // Свободные ячейки: не занятые ни товаром, ни тарой. Берём вразброс, а не
  // подряд: иначе первая секция забилась бы целиком, а дальние стояли пустыми.
  const cells = allCells(warehouse).filter((c) => c.pickable);
  const taken = new Set(Object.keys(buildOccupancy(base.placements, base.boxes)));
  const free = cells.map((c) => c.addr).filter((a) => !taken.has(addressKey(a)));
  for (let i = free.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [free[i], free[j]] = [free[j], free[i]];
  }
  const budget = Math.max(0, Math.round(cells.length * TARGET_FILL) - taken.size);
  let used = 0;
  const takeCell = (): CellAddress | undefined => (used < budget ? free[used++] : undefined);

  const isWorkday = (ts: number) => {
    const d = new Date(ts).getDay();
    return d !== 0 && d !== 6;
  };
  // Будни месяца, от старых к новым; сегодняшний день — у `seedHistory`.
  const days: number[] = [];
  for (let ago = MONTH_DAYS; ago >= 1; ago--) {
    const day = dayStart(now - ago * DAY);
    if (isWorkday(day)) days.push(day);
  }

  // --- Пополнение -----------------------------------------------------------
  // Партий хватает, чтобы занять бюджет ячеек к последней неделе месяца:
  // в партии около 14 коробов.
  const perDay = Math.max(1, Math.ceil(budget / Math.max(1, days.length) / 14));
  for (const day of days) {
    for (let n = 0; n < perDay && used < budget; n++) {
      const supplier = pick(SUPPLIERS);
      const createdAt = day + between(8, 11) * 3_600_000;
      const lines: ExpectedShipmentLine[] = [];
      for (let i = 0, count = between(4, 7); i < count; i++) {
        const product = pick(products);
        if (lines.some((l) => l.productId === product.id)) continue;
        lines.push({
          id: uid("expl"),
          productId: product.id,
          expectedQty: between(3, 6) * 12,
          receivedQty: 0,
        });
      }
      for (const line of lines) {
        const perBox = pick([12, 12, 24]);
        let left = line.expectedQty;
        while (left > 0) {
          const address = takeCell();
          if (!address) break;
          const qty = Math.min(perBox, left);
          const ts = createdAt + between(1, 7) * 3_600_000;
          out.boxSeq += 1;
          const box: Box = {
            id: uid("box"),
            barcode: generateBoxBarcode(out.boxSeq),
            createdAt: ts,
            lines: [{ productId: line.productId, qty }],
            address,
          };
          out.boxes.push(box);
          out.receivingEvents.push({
            id: uid("rcv"),
            productId: line.productId,
            qty,
            boxId: box.id,
            staffId: staffId(receivers),
            timestamp: ts,
            expectedShipmentLineId: line.id,
          });
          line.receivedQty += qty;
          left -= qty;
        }
      }
      const got = lines.filter((l) => l.receivedQty > 0);
      if (!got.length) continue;
      out.expectedShipments.push({
        id: uid("exp"),
        source: supplier.source,
        title: `Поставка ${fmtDate(createdAt)} · ${supplier.title}`,
        lines: got,
        createdAt,
        status: "closed",
        closedAt: createdAt + 9 * 3_600_000,
      });
    }
  }

  // --- Отгрузки -------------------------------------------------------------
  // Каждый будний день один-два рейса по 4–9 заявок. Заявка берёт товар из
  // короба, принятого до этого дня, и вычитает уехавшее из него же.
  for (const day of days) {
    const ready = out.boxes.filter((b) => b.createdAt < day);
    if (!ready.length) continue;
    for (let r = 0, trips = between(1, 2); r < trips; r++) {
      const shippedAt = day + between(15, 18) * 3_600_000;
      const destination = pick(DESTINATIONS);
      const vehicle = pick(VEHICLES);
      const ids: string[] = [];
      for (let i = 0, count = between(4, 9); i < count; i++) {
        const line = pick(ready).lines[0];
        if (line.qty <= 1) continue;
        const qty = between(1, Math.min(6, line.qty - 1));
        line.qty -= qty;
        const req: FulfillmentRequest = {
          id: uid("req"),
          productId: line.productId,
          qty,
          note: destination,
          truckDate: shippedAt,
          vehicle,
          status: "shipped",
          createdAt: day - DAY + between(10, 18) * 3_600_000,
          updatedAt: shippedAt,
          startedAt: shippedAt - between(3, 6) * 3_600_000,
          pickedQty: qty,
          shippedAt,
        };
        out.requests.push(req);
        ids.push(req.id);
      }
      if (!ids.length) continue;
      out.shipments.push({
        id: uid("shp"),
        destination,
        requestIds: ids,
        vehicle,
        staffId: staffId(pickers),
        shippedAt,
      });
    }
  }
  return out;
}
