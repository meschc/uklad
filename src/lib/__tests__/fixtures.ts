import type {
  Box,
  ExpectedShipment,
  ExpectedShipmentLine,
  Floor,
  FulfillmentRequest,
  PlacedModule,
  Product,
  ShelfConfig,
  Warehouse,
} from "../types";

/**
 * Заготовки доменных объектов для тестов.
 *
 * Смысл в том, чтобы в самом тесте оставались только те поля, ради которых он
 * написан: «полка с приоритетом 10», «строка поставки на 5 штук». Остальное —
 * шум, из-за которого потом не видно, что именно проверяется.
 */

let seq = 0;
/** Предсказуемый id: тесты сравнивают значения, а не гадают по случайным. */
const nextId = (prefix: string) => `${prefix}-${++seq}`;

export function makeProduct(over: Partial<Product> = {}): Product {
  return {
    id: nextId("prod"),
    sku: "SKU-1",
    barcode: "4600000000001",
    name: "Товар",
    category: "Прочее",
    widthCm: 10,
    heightCm: 10,
    depthCm: 10,
    ...over,
  };
}

export function makeShelf(over: Partial<ShelfConfig> = {}): ShelfConfig {
  return { id: nextId("shelf"), cells: 1, ...over };
}

/**
 * Секция с реальными габаритами: без них `cellDimsCm` вернёт нули, и подбор
 * места молча перестанет находить хоть что-нибудь.
 */
export function makeSection(over: Partial<PlacedModule> = {}): PlacedModule {
  return {
    id: nextId("mod"),
    type: "section",
    x: 0,
    y: 0,
    w: 4,
    h: 1,
    rotation: 0,
    realWidthCm: 100,
    realDepthCm: 50,
    realHeightCm: 200,
    shelves: [makeShelf()],
    ...over,
  };
}

export function makeFloor(modules: PlacedModule[], over: Partial<Floor> = {}): Floor {
  return { id: nextId("floor"), name: "Этаж", modules, ...over };
}

export function makeWarehouse(floors: Floor[], over: Partial<Warehouse> = {}): Warehouse {
  return {
    id: nextId("wh"),
    name: "Тестовый склад",
    kind: "mezzanine",
    floors,
    ...over,
  };
}

export function makeBox(over: Partial<Box> = {}): Box {
  return {
    id: nextId("box"),
    barcode: "UK-BOX-000001",
    createdAt: 0,
    lines: [],
    ...over,
  };
}

export function makeRequest(over: Partial<FulfillmentRequest> = {}): FulfillmentRequest {
  return {
    id: nextId("req"),
    productId: "prod-x",
    qty: 1,
    status: "new",
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

export function makeShipmentLine(
  over: Partial<ExpectedShipmentLine> = {},
): ExpectedShipmentLine {
  return {
    id: nextId("line"),
    productId: "prod-x",
    expectedQty: 10,
    receivedQty: 0,
    ...over,
  };
}

export function makeShipment(over: Partial<ExpectedShipment> = {}): ExpectedShipment {
  return {
    id: nextId("ship"),
    source: "manual",
    lines: [],
    createdAt: 0,
    status: "pending",
    ...over,
  };
}
