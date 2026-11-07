import { describe, expect, it, vi } from "vitest";
import type { CellAddress } from "../../types";
import { makeBox, makeRequest, makeShipment, makeShipmentLine } from "../../__tests__/fixtures";
import { makeRequestsStore } from "./harness";

/**
 * Жизненный цикл заявки: создание → в работе → собрана → отгружена.
 *
 * Проверяем переходы, которые нельзя увидеть глазами: списание единицы с места,
 * отказ отгружать несобранное, снятие брони при отмене. Каждый из них при поломке
 * ведёт себя как успех — заявка просто закрывается «немного не тем» числом.
 */

const ADDR: CellAddress = {
  floorId: "f1",
  moduleId: "m1",
  shelfIndex: 0,
  cellIndex: 0,
};

describe("createRequest / createRequests", () => {
  it("округляет количество и не создаёт заявку меньше чем на единицу", () => {
    // Arrange
    const store = makeRequestsStore({ requests: [] });

    // Act
    store.getState().createRequest({ productId: "p1", qty: 2.6 });
    store.getState().createRequest({ productId: "p1", qty: 0 });

    // Assert
    expect(store.getState().requests.map((r) => r.qty)).toEqual([1, 3]);
  });

  it("отбрасывает строки импорта без товара и с неположительным количеством", () => {
    // Arrange
    const store = makeRequestsStore({ requests: [] });

    // Act
    const ids = store.getState().createRequests([
      { productId: "p1", qty: 2 },
      { productId: "", qty: 5 },
      { productId: "p2", qty: 0 },
      { productId: "p3", qty: -1 },
    ]);

    // Assert
    expect(ids).toHaveLength(1);
    expect(store.getState().requests[0].productId).toBe("p1");
  });

  it("хранит источник площадки и её номер заказа, «свой» источник не записывает", () => {
    // Arrange
    const store = makeRequestsStore({ requests: [] });

    // Act
    store.getState().createRequests([
      { productId: "p1", qty: 1, source: "ozon", externalId: "  12345-0001  " },
      { productId: "p2", qty: 1, source: "manual" },
      { productId: "p3", qty: 1, source: "avito" as never },
      { productId: "p4", qty: 1 },
    ]);

    // Assert: пакет встаёт в список в том порядке, в каком введён.
    const [ozon, manual, unknown, none] = store.getState().requests;
    expect(ozon).toMatchObject({ source: "ozon", externalId: "12345-0001" });
    expect(manual.source).toBeUndefined();
    expect(unknown.source).toBeUndefined();
    expect(none.source).toBeUndefined();
    expect(none.externalId).toBeUndefined();
  });

  it("номер заказа живёт только вместе с площадкой и обрезается до 64 знаков", () => {
    // Arrange
    const store = makeRequestsStore({ requests: [] });

    // Act
    store.getState().createRequests([
      { productId: "p1", qty: 1, source: "manual", externalId: "123" },
      { productId: "p2", qty: 1, externalId: "456" },
      { productId: "p3", qty: 1, source: "wildberries", externalId: "x".repeat(200) },
    ]);

    // Assert
    const [manual, none, wb] = store.getState().requests;
    expect(manual.externalId).toBeUndefined();
    expect(none.externalId).toBeUndefined();
    expect(wb.externalId).toHaveLength(64);
  });

  it("возвращает пустой список, когда создавать нечего, и не трогает стор", () => {
    // Arrange
    const store = makeRequestsStore({ requests: [] });
    const before = store.getState().requests;

    // Act
    const ids = store.getState().createRequests([{ productId: "", qty: 0 }]);

    // Assert
    expect(ids).toEqual([]);
    expect(store.getState().requests).toBe(before);
  });

  it("проставляет общую дату машины всему пакету", () => {
    // Arrange
    const store = makeRequestsStore({ requests: [] });
    const truckDate = 1_700_000_000_000;

    // Act
    store.getState().createRequests(
      [
        { productId: "p1", qty: 1 },
        { productId: "p2", qty: 1 },
      ],
      truckDate,
    );

    // Assert
    expect(store.getState().requests.every((r) => r.truckDate === truckDate)).toBe(true);
  });
});

describe("updateRequestStatus / startPicking", () => {
  it("фиксирует момент взятия в работу один раз", () => {
    // Arrange: на этой метке стоит метрика «среднее время сборки» — если она
    // обновляется при каждом заходе, время всегда выходит близким к нулю.
    const store = makeRequestsStore({
      requests: [makeRequest({ id: "r1", productId: "p1", qty: 1 })],
    });

    // Act
    store.getState().updateRequestStatus("r1", "in_progress");
    const first = store.getState().requests[0].startedAt;
    store.getState().updateRequestStatus("r1", "new");
    store.getState().updateRequestStatus("r1", "in_progress");

    // Assert
    expect(store.getState().requests[0].startedAt).toBe(first);
  });

  it("отмена заявки снимает бронь под поставку", () => {
    // Arrange
    const line = makeShipmentLine({ productId: "p1", expectedQty: 10 });
    const store = makeRequestsStore({
      requests: [makeRequest({ id: "r1", productId: "p1", qty: 2 })],
      expectedShipments: [makeShipment({ lines: [line] })],
    });
    store.getState().reserveRequest("r1");

    // Act
    store.getState().updateRequestStatus("r1", "cancelled");

    // Assert
    expect(store.getState().expectedShipments[0].lines[0].reservedFor).toEqual([]);
    expect(store.getState().requests[0].reservedShipmentId).toBeUndefined();
  });

  it("не поднимает в работу собранную или отменённую заявку", () => {
    // Arrange
    const store = makeRequestsStore({
      requests: [
        makeRequest({ id: "собрана", productId: "p1", qty: 1, status: "done" }),
        makeRequest({ id: "отменена", productId: "p1", qty: 1, status: "cancelled" }),
      ],
    });

    // Act
    store.getState().startPicking("собрана");
    store.getState().startPicking("отменена");

    // Assert
    expect(store.getState().requests.map((r) => r.status)).toEqual(["done", "cancelled"]);
  });
});

describe("recordPick", () => {
  it("списывает единицу из коробки и увеличивает счётчик заявки", () => {
    // Arrange
    const box = makeBox({ address: ADDR, lines: [{ productId: "p1", qty: 4 }] });
    const removeFromBox = vi.fn(() => 1);
    const store = makeRequestsStore({
      requests: [makeRequest({ id: "r1", productId: "p1", qty: 3 })],
      boxes: [box],
      placements: {},
      removeFromBox,
    });

    // Act
    const picked = store.getState().recordPick("r1", "p1", ADDR);

    // Assert
    expect(removeFromBox).toHaveBeenCalledWith(box.id, "p1", 1);
    expect(picked).toBe(1);
    expect(store.getState().requests[0].pickedQty).toBe(1);
  });

  it("кладёт снятое в тару сборки и помечает заявку этой тарой", () => {
    // Arrange: снятое с полки не исчезает — оно едет к столу упаковки.
    const shelf = makeBox({ address: ADDR, lines: [{ productId: "p1", qty: 4 }] });
    const tote = makeBox({ id: "tote1", lines: [] });
    const store = makeRequestsStore({
      requests: [makeRequest({ id: "r1", productId: "p1", qty: 3 })],
      boxes: [shelf, tote],
      placements: {},
      removeFromBox: () => 1,
    });

    // Act
    store.getState().recordPick("r1", "p1", ADDR, "tote1");
    store.getState().recordPick("r1", "p1", ADDR, "tote1");

    // Assert
    const after = store.getState();
    expect(after.boxes.find((b) => b.id === "tote1")?.lines).toEqual([{ productId: "p1", qty: 2 }]);
    expect(after.requests[0]).toMatchObject({ pickedQty: 2, toteId: "tote1" });
  });

  it("списывает прямое размещение, когда коробки на месте нет", () => {
    // Arrange
    const clearPlacement = vi.fn();
    const store = makeRequestsStore({
      requests: [makeRequest({ id: "r1", productId: "p1", qty: 2 })],
      boxes: [],
      placements: { p1: ADDR },
      clearPlacement,
    });

    // Act
    const picked = store.getState().recordPick("r1", "p1", ADDR);

    // Assert
    expect(clearPlacement).toHaveBeenCalledWith("p1");
    expect(picked).toBe(1);
  });

  it("не растит счётчик, если на месте ничего не нашлось", () => {
    // Arrange: сканер увёл сборщика не туда — счётчик обязан остаться прежним.
    const store = makeRequestsStore({
      requests: [makeRequest({ id: "r1", productId: "p1", qty: 3, pickedQty: 2 })],
      boxes: [],
      placements: {},
    });

    // Act
    const picked = store.getState().recordPick("r1", "p1", ADDR);

    // Assert
    expect(picked).toBe(2);
    expect(store.getState().requests[0].pickedQty).toBe(2);
  });

  it("не собирает больше, чем заказано", () => {
    // Arrange
    const store = makeRequestsStore({
      requests: [makeRequest({ id: "r1", productId: "p1", qty: 1, pickedQty: 1 })],
      boxes: [makeBox({ address: ADDR, lines: [{ productId: "p1", qty: 9 }] })],
      placements: {},
      removeFromBox: () => 1,
    });

    // Act
    const picked = store.getState().recordPick("r1", "p1", ADDR);

    // Assert
    expect(picked).toBe(1);
  });

  it("возвращает ноль по неизвестной заявке", () => {
    // Arrange
    const store = makeRequestsStore({ requests: [], boxes: [], placements: {} });

    // Act & Assert
    expect(store.getState().recordPick("нет-такой", "p1", ADDR)).toBe(0);
  });
});

describe("completeRequest", () => {
  it("закрывает заявку и снимает бронь", () => {
    // Arrange
    const line = makeShipmentLine({ productId: "p1", expectedQty: 10 });
    const store = makeRequestsStore({
      requests: [makeRequest({ id: "r1", productId: "p1", qty: 2 })],
      expectedShipments: [makeShipment({ lines: [line] })],
    });
    store.getState().reserveRequest("r1");

    // Act
    store.getState().completeRequest("r1");

    // Assert
    expect(store.getState().requests[0].status).toBe("done");
    expect(store.getState().requests[0].partial).toBe(false);
    expect(store.getState().expectedShipments[0].lines[0].reservedFor).toEqual([]);
  });

  it("помечает частичное закрытие", () => {
    // Arrange
    const store = makeRequestsStore({
      requests: [makeRequest({ id: "r1", productId: "p1", qty: 5, pickedQty: 2 })],
      expectedShipments: [],
    });

    // Act
    store.getState().completeRequest("r1", true);

    // Assert
    expect(store.getState().requests[0].partial).toBe(true);
  });
});

describe("shipRequests", () => {
  it("отгружает только собранные заявки", () => {
    // Arrange: «в работе» и «новые» физически ещё лежат на полках.
    const store = makeRequestsStore({
      requests: [
        makeRequest({ id: "собрана", productId: "p1", qty: 1, status: "done", note: "Тула" }),
        makeRequest({ id: "в работе", productId: "p1", qty: 1, status: "in_progress" }),
      ],
      shipments: [],
      showToast: vi.fn(),
    });

    // Act
    const shipmentId = store.getState().shipRequests(["собрана", "в работе"]);

    // Assert
    expect(shipmentId).not.toBeNull();
    const byId = Object.fromEntries(store.getState().requests.map((r) => [r.id, r]));
    expect(byId["собрана"].status).toBe("shipped");
    expect(byId["собрана"].shipmentId).toBe(shipmentId);
    expect(byId["в работе"].status).toBe("in_progress");
    expect(store.getState().shipments[0].requestIds).toEqual(["собрана"]);
  });

  it("берёт назначение рейса из первой собранной заявки", () => {
    // Arrange
    const store = makeRequestsStore({
      requests: [
        makeRequest({ id: "r1", productId: "p1", qty: 1, status: "done", note: "  Тула  " }),
      ],
      shipments: [],
      showToast: vi.fn(),
    });

    // Act
    store.getState().shipRequests(["r1"], { vehicle: " А123ВС ", staffId: "s1" });

    // Assert
    expect(store.getState().shipments[0]).toMatchObject({
      destination: "Тула",
      vehicle: "А123ВС",
      staffId: "s1",
    });
  });

  it("записывает в рейс паллеты и короба, которые погрузили", () => {
    // Arrange
    const store = makeRequestsStore({
      requests: [makeRequest({ id: "r1", productId: "p1", qty: 1, status: "done", note: "Тула" })],
      shipments: [],
      showToast: vi.fn(),
    });

    // Act
    store
      .getState()
      .shipRequests(["r1"], { vehicle: "А123ВС", units: ["UK-PLT-000001", "UK-BOX-000002"] });

    // Assert
    expect(store.getState().shipments[0].units).toEqual(["UK-PLT-000001", "UK-BOX-000002"]);
  });

  it("без погрузки по кодам поле units не появляется", () => {
    // Arrange
    const store = makeRequestsStore({
      requests: [makeRequest({ id: "r1", productId: "p1", qty: 1, status: "done" })],
      shipments: [],
      showToast: vi.fn(),
    });

    // Act
    store.getState().shipRequests(["r1"], { vehicle: "А123ВС", units: [] });

    // Assert
    expect(store.getState().shipments[0].units).toBeUndefined();
  });

  it("возвращает null и не создаёт рейс, когда отгружать нечего", () => {
    // Arrange
    const showToast = vi.fn();
    const store = makeRequestsStore({
      requests: [makeRequest({ id: "r1", productId: "p1", qty: 1, status: "new" })],
      shipments: [],
      showToast,
    });

    // Act
    const shipmentId = store.getState().shipRequests(["r1"]);

    // Assert
    expect(shipmentId).toBeNull();
    expect(store.getState().shipments).toEqual([]);
    expect(showToast).not.toHaveBeenCalled();
  });
});

describe("shipRequests и короба отгрузки", () => {
  it("закрывает рейсом погруженные короба, а заявка другого короба ждёт", () => {
    // Arrange
    const base = { lines: [], packedBy: ["s1"], createdAt: 1, updatedAt: 1 };
    const store = makeRequestsStore({
      requests: [
        makeRequest({ id: "r1", productId: "p1", qty: 1, status: "done", note: "Тула" }),
        makeRequest({ id: "r2", productId: "p1", qty: 1, status: "done", note: "Тула" }),
      ],
      shipments: [],
      outboundBoxes: [
        { ...base, id: "o1", code: "UK-OUT-TULA01", requestIds: ["r1"] },
        { ...base, id: "o2", code: "UK-OUT-TULA02", requestIds: ["r2"] },
      ],
      showToast: vi.fn(),
    });

    // Act
    const shipmentId = store.getState().shipRequests(["r1", "r2"], { units: ["uk-out-tula01"] });

    // Assert: r2 не «уехала» без своего короба.
    const [loaded, left] = store.getState().outboundBoxes;
    expect(loaded.shipmentId).toBe(shipmentId);
    expect(left.shipmentId).toBeUndefined();
    const status = Object.fromEntries(store.getState().requests.map((r) => [r.id, r.status]));
    expect(status).toEqual({ r1: "shipped", r2: "done" });
  });

  it("не отправляет рейс, если заявка уехала бы без второго короба", () => {
    const base = { lines: [], packedBy: ["s1"], createdAt: 1, updatedAt: 1 };
    const store = makeRequestsStore({
      requests: [makeRequest({ id: "r1", productId: "p1", qty: 1, status: "done", note: "Тула" })],
      shipments: [],
      outboundBoxes: [
        { ...base, id: "o1", code: "UK-OUT-TULA01", requestIds: ["r1"] },
        { ...base, id: "o2", code: "UK-OUT-TULA02", requestIds: ["r1"] },
      ],
      showToast: vi.fn(),
    });

    expect(store.getState().shipRequests(["r1"], { units: ["UK-OUT-TULA01"] })).toBeNull();
    expect(store.getState().requests[0].status).toBe("done");
    expect(store.getState().outboundBoxes.every((b) => !b.shipmentId)).toBe(true);
  });
});
