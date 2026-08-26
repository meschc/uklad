import { uid } from "../utils";
import { generateBoxBarcode, generatePalletBarcode } from "../barcode";
import { addressKey } from "../address";
import { allCells } from "../placement";
import type {
  Box,
  CellAddress,
  ExpectedShipment,
  ExpectedShipmentLine,
  FulfillmentRequest,
  Pallet,
  Product,
  ReceivingEvent,
  Shipment,
  ShipmentSource,
  StaffMember,
  Warehouse,
} from "../types";

/**
 * История работы демо-склада (п.8): поставки, приёмки, тара, заявки и рейсы за
 * последние два с половиной месяца.
 *
 * Зачем: пустые экраны «Аналитика», «Задания» и «Документы» невозможно ни
 * оценить, ни показать — метрика без истории всегда рисует ноль, а накладную
 * не по чему сформировать. Склад в демо должен выглядеть работающим не первый
 * год, а не установленным сегодня утром.
 *
 * Числа детерминированные: свой генератор с фиксированным зерном вместо
 * `Math.random`. Иначе каждый новый запуск давал бы другую занятость и другие
 * графики, и любое «стало хуже» было бы не с чем сравнить.
 */

const DAY = 86_400_000;

/** Простейший детерминированный ГПСЧ (mulberry32) — одинаков от запуска к запуску. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SUPPLIERS: { title: string; source: ShipmentSource }[] = [
  { title: "Ромашка Трейд", source: "1c" },
  { title: "ТехноЛайн", source: "moysklad" },
  { title: "Северный склад", source: "1c" },
  { title: "Дом и Сад", source: "manual" },
  { title: "Мамедова Л. Р.", source: "ava" },
  { title: "Ковалёв А. С.", source: "moysklad" },
];

/** Куда уезжают собранные заявки — реальные точки выдачи и магазины. */
const DESTINATIONS = [
  "ПВЗ Ozon, Москва, Дмитровское ш. 100",
  "Склад WB Коледино",
  "Магазин «Ромашка», Тверская 18",
  "ПВЗ Яндекс Маркет, Химки, Ленинградская 1",
  "Самовывоз, ворота №3",
  "СДЭК, Москва, Шоссе Энтузиастов 56",
];

const VEHICLES = [
  "А432ТК 777 · Соколов",
  "Е117МН 190 · Гаджиев",
  "К909ВР 777 · Титов",
  "Газель О551СН 750",
];

export interface SeededHistory {
  expectedShipments: ExpectedShipment[];
  receivingEvents: ReceivingEvent[];
  boxes: Box[];
  pallets: Pallet[];
  boxSeq: number;
  palletSeq: number;
  requests: FulfillmentRequest[];
  shipments: Shipment[];
}

/**
 * Собрать историю. Адреса для тары берутся из СВОБОДНЫХ ячеек: занятость —
 * общая для размещений и коробок, и посадить короб в занятую ячейку означало
 * бы соврать тепловой карте на старте.
 */
export function seedHistory(
  warehouse: Warehouse,
  products: Product[],
  placements: Record<string, CellAddress>,
  now = Date.now(),
): SeededHistory {
  if (!products.length) return empty();

  const rand = rng(20260820);
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
  const between = (min: number, max: number) =>
    min + Math.floor(rand() * (max - min + 1));

  const staff = warehouse.staff ?? [];
  const receivers = staff.filter((s) => /приём|кладов/i.test(s.role));
  const pickers = staff.filter((s) => /комплект|кладов/i.test(s.role));
  const staffId = (pool: StaffMember[]) =>
    pool.length ? pick(pool).id : undefined;

  // Свободные ячейки под тару: всё, что не занято прямым размещением товара.
  const taken = new Set(Object.values(placements).map(addressKey));
  const freeCells = allCells(warehouse)
    .filter((c) => c.pickable && !taken.has(addressKey(c.addr)))
    .map((c) => c.addr);
  let freeIdx = 0;
  const takeCell = (): CellAddress | undefined => freeCells[freeIdx++];

  const expectedShipments: ExpectedShipment[] = [];
  const receivingEvents: ReceivingEvent[] = [];
  const boxes: Box[] = [];
  const pallets: Pallet[] = [];
  let boxSeq = 0;
  let palletSeq = 0;

  // --- Поставки и приёмка ---------------------------------------------------
  // Тринадцать партий за 70 дней, и большая часть — в последние две недели:
  // именно за 14 дней считается график приёмки, и одна-две палки на нём
  // выглядели бы как склад, куда завозят раз в месяц.
  const PLAN: { daysAgo: number; status: ExpectedShipment["status"] }[] = [
    { daysAgo: 68, status: "closed" },
    { daysAgo: 55, status: "closed" },
    { daysAgo: 41, status: "closed" },
    { daysAgo: 33, status: "closed" },
    { daysAgo: 26, status: "closed" },
    { daysAgo: 19, status: "closed" },
    { daysAgo: 13, status: "closed" },
    { daysAgo: 11, status: "closed" },
    { daysAgo: 8, status: "closed" },
    { daysAgo: 6, status: "closed" },
    { daysAgo: 4, status: "closed" },
    { daysAgo: 2, status: "receiving" },
    { daysAgo: 0, status: "pending" },
  ];

  for (const plan of PLAN) {
    const supplier = pick(SUPPLIERS);
    const createdAt = now - plan.daysAgo * DAY - between(2, 9) * 3_600_000;
    const lineCount = between(4, 8);
    const lines: ExpectedShipmentLine[] = [];
    const shipmentId = uid("exp");

    for (let i = 0; i < lineCount; i++) {
      const product = pick(products);
      if (lines.some((l) => l.productId === product.id)) continue;
      const expectedQty = between(6, 40);
      lines.push({
        id: uid("expl"),
        productId: product.id,
        expectedQty,
        receivedQty: 0,
      });
    }

    // Что из партии реально приняли. Закрытая — принята почти целиком (иногда
    // с недостачей), «в работе» — наполовину, «не начата» — вовсе нет.
    const share =
      plan.status === "closed" ? 1 : plan.status === "receiving" ? 0.5 : 0;

    let box: Box | null = null;
    let inBox = 0;
    const closeBox = () => {
      if (!box) return;
      box.address = takeCell();
      boxes.push(box);
      box = null;
      inBox = 0;
    };

    for (const line of lines) {
      if (share === 0) break;
      // Недостача — редкая, но настоящая: примерно одна строка из двадцати.
      // Больше — и склад в демо выглядел бы как склад с проблемным поставщиком,
      // а доля расхождений на дашборде читается именно как оценка качества.
      const shortage = share === 1 && rand() < 0.05;
      const got = shortage
        ? Math.max(1, line.expectedQty - between(1, 3))
        : Math.round(line.expectedQty * share);
      if (got <= 0) continue;
      line.receivedQty = got;

      const ts = createdAt + between(1, 6) * 3_600_000;
      if (!box) {
        boxSeq += 1;
        box = {
          id: uid("box"),
          barcode: generateBoxBarcode(boxSeq),
          createdAt: ts,
          lines: [],
        };
      }
      box.lines = [...box.lines, { productId: line.productId, qty: got }];
      inBox += 1;

      receivingEvents.push({
        id: uid("rcv"),
        productId: line.productId,
        qty: got,
        boxId: box.id,
        staffId: staffId(receivers),
        timestamp: ts,
        expectedShipmentLineId: line.id,
        discrepancy: shortage ? "shortage" : undefined,
      });

      // Три позиции в короб — дальше берут новый: так же, как руками.
      if (inBox >= 3) closeBox();
    }
    closeBox();

    expectedShipments.push({
      id: shipmentId,
      source: supplier.source,
      title: `Поставка ${fmtDate(createdAt)} · ${supplier.title}`,
      lines,
      createdAt,
      status: plan.status,
      closedAt: plan.status === "closed" ? createdAt + 8 * 3_600_000 : undefined,
    });
  }

  // --- Паллеты --------------------------------------------------------------
  // Часть коробов стоит на паллетах: так возят крупные партии, и экран «Что
  // это?» должен уметь показать паллету с содержимым, а не только короб.
  for (let i = 0; i < 4; i++) {
    const chunk = boxes.slice(i * 3, i * 3 + 3).filter((b) => b.address);
    if (chunk.length < 2) break;
    palletSeq += 1;
    const pallet: Pallet = {
      id: uid("plt"),
      barcode: generatePalletBarcode(palletSeq),
      createdAt: chunk[0].createdAt,
      boxIds: chunk.map((b) => b.id),
      address: chunk[0].address,
    };
    for (const b of chunk) b.palletId = pallet.id;
    pallets.push(pallet);
  }

  // --- Заявки и рейсы -------------------------------------------------------
  const requests: FulfillmentRequest[] = [];
  const shipments: Shipment[] = [];

  // Заявки выписываем на то, что на складе реально есть и в заметном
  // количестве. Случайный товар из каталога лежит в одном экземпляре, и весь
  // экран заданий покраснел бы от «нужно 14, на складе 1» — склад выглядел бы
  // не работающим, а безнадёжно пустым.
  const inStock = new Map<string, number>();
  for (const b of boxes) {
    if (!b.address) continue;
    for (const l of b.lines) {
      inStock.set(l.productId, (inStock.get(l.productId) ?? 0) + l.qty);
    }
  }
  const stockPool = [...inStock.entries()]
    .filter(([, qty]) => qty >= 4)
    .map(([productId, qty]) => ({ productId, qty }));

  /** Товар для заявки и посильное количество: из остатков, если они есть. */
  const orderLine = (): { productId: string; qty: number } => {
    if (!stockPool.length) {
      return { productId: pick(products).id, qty: between(2, 12) };
    }
    const s = pick(stockPool);
    return { productId: s.productId, qty: between(2, Math.min(20, s.qty)) };
  };

  // Шесть состоявшихся рейсов за два месяца: по ним считаются среднее время
  // сборки и график отгрузок, и по ним же печатается накладная.
  for (let r = 0; r < 6; r++) {
    const shippedAt = now - (62 - r * 10) * DAY + between(9, 17) * 3_600_000;
    const destination = DESTINATIONS[r % DESTINATIONS.length];
    const vehicle = pick(VEHICLES);
    const ids: string[] = [];

    for (let i = 0; i < between(2, 5); i++) {
      const { productId, qty } = orderLine();
      const createdAt = shippedAt - between(2, 5) * DAY;
      const startedAt = shippedAt - between(3, 9) * 3_600_000;
      // Изредка собрали меньше заказанного — и это видно в накладной.
      const partial = rand() < 0.15;
      const req: FulfillmentRequest = {
        id: uid("req"),
        productId,
        qty,
        note: destination,
        truckDate: shippedAt,
        vehicle,
        status: "shipped",
        createdAt,
        updatedAt: shippedAt,
        startedAt,
        pickedQty: partial ? Math.max(1, qty - between(1, 3)) : qty,
        partial: partial || undefined,
        shippedAt,
      };
      requests.push(req);
      ids.push(req.id);
    }

    shipments.push({
      id: uid("shp"),
      destination,
      requestIds: ids,
      vehicle,
      staffId: staffId(pickers),
      shippedAt,
    });
  }

  // Текущая работа: собрано и ждёт погрузки, в работе, только что принято.
  const OPEN: {
    status: FulfillmentRequest["status"];
    daysAhead: number;
    count: number;
  }[] = [
    { status: "done", daysAhead: 0, count: 3 },
    { status: "in_progress", daysAhead: 1, count: 2 },
    { status: "new", daysAhead: 1, count: 4 },
    { status: "new", daysAhead: 3, count: 3 },
    { status: "new", daysAhead: 6, count: 2 },
  ];

  for (const group of OPEN) {
    const destination = pick(DESTINATIONS);
    const truckDate = dayStart(now) + group.daysAhead * DAY + 10 * 3_600_000;
    for (let i = 0; i < group.count; i++) {
      const { productId, qty } = orderLine();
      const createdAt = now - between(1, 6) * DAY;
      const started = group.status !== "new";
      requests.push({
        id: uid("req"),
        productId,
        qty,
        note: destination,
        truckDate,
        vehicle: rand() < 0.5 ? pick(VEHICLES) : undefined,
        status: group.status,
        createdAt,
        updatedAt: now - between(1, 20) * 3_600_000,
        startedAt: started ? now - between(2, 26) * 3_600_000 : undefined,
        pickedQty:
          group.status === "done"
            ? qty
            : group.status === "in_progress"
              ? between(1, Math.max(1, qty - 1))
              : undefined,
      });
    }
  }

  return {
    expectedShipments,
    receivingEvents,
    boxes,
    pallets,
    boxSeq,
    palletSeq,
    requests,
    shipments,
  };
}

function empty(): SeededHistory {
  return {
    expectedShipments: [],
    receivingEvents: [],
    boxes: [],
    pallets: [],
    boxSeq: 0,
    palletSeq: 0,
    requests: [],
    shipments: [],
  };
}

function dayStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}
