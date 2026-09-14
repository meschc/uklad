import { describe, expect, it } from "vitest";
import { makeRequest, makeShipment, makeShipmentLine } from "../../__tests__/fixtures";
import { makeRequestsStore } from "./harness";

/**
 * Бронь под ожидаемую поставку и кроссдокинг.
 *
 * Оба расчёта ошибаются беззвучно: перебронь выглядит как обычная бронь, а
 * непогашенная бронь — как занятое количество, которого на самом деле нет.
 * Заметить это можно только по расхождению через неделю, поэтому проверяем
 * арифметику свободного остатка и порядок закрытия заявок.
 */

describe("reserveRequest", () => {
  it("бронирует строку, где свободного хватает на всю заявку", () => {
    // Arrange
    const line = makeShipmentLine({ productId: "p1", expectedQty: 10, receivedQty: 0 });
    const shipment = makeShipment({ lines: [line] });
    const req = makeRequest({ productId: "p1", qty: 4 });
    const store = makeRequestsStore({
      requests: [req],
      expectedShipments: [shipment],
    });

    // Act
    const bookedTo = store.getState().reserveRequest(req.id);

    // Assert
    expect(bookedTo).toBe(shipment.id);
    expect(store.getState().expectedShipments[0].lines[0].reservedFor).toEqual([req.id]);
    expect(store.getState().requests[0].reservedShipmentId).toBe(shipment.id);
  });

  it("вычитает уже принятое количество из свободного", () => {
    // Arrange: из 10 ожидаемых 8 уже приняли — на полке они, а не в поставке.
    const line = makeShipmentLine({ productId: "p1", expectedQty: 10, receivedQty: 8 });
    const store = makeRequestsStore({
      requests: [makeRequest({ id: "r1", productId: "p1", qty: 3 })],
      expectedShipments: [makeShipment({ lines: [line] })],
    });

    // Act
    const bookedTo = store.getState().reserveRequest("r1");

    // Assert
    expect(bookedTo).toBeNull();
  });

  it("не продаёт одно и то же количество дважды", () => {
    // Arrange: строка на 5, первая заявка уже забрала 3 — второй на 3 не хватит.
    const line = makeShipmentLine({ productId: "p1", expectedQty: 5, receivedQty: 0 });
    const store = makeRequestsStore({
      requests: [
        makeRequest({ id: "r1", productId: "p1", qty: 3 }),
        makeRequest({ id: "r2", productId: "p1", qty: 3 }),
      ],
      expectedShipments: [makeShipment({ lines: [line] })],
    });

    // Act
    const first = store.getState().reserveRequest("r1");
    const second = store.getState().reserveRequest("r2");

    // Assert
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(store.getState().expectedShipments[0].lines[0].reservedFor).toEqual(["r1"]);
  });

  it("не бронирует закрытую поставку", () => {
    // Arrange: закрытая партия уже разобрана — ждать от неё нечего.
    const store = makeRequestsStore({
      requests: [makeRequest({ id: "r1", productId: "p1", qty: 1 })],
      expectedShipments: [
        makeShipment({
          status: "closed",
          lines: [makeShipmentLine({ productId: "p1", expectedQty: 10 })],
        }),
      ],
    });

    // Act
    const bookedTo = store.getState().reserveRequest("r1");

    // Assert
    expect(bookedTo).toBeNull();
  });

  it("повторная бронь возвращает прежнюю поставку и не задваивает ссылку", () => {
    // Arrange
    const line = makeShipmentLine({ productId: "p1", expectedQty: 10 });
    const shipment = makeShipment({ lines: [line] });
    const store = makeRequestsStore({
      requests: [makeRequest({ id: "r1", productId: "p1", qty: 2 })],
      expectedShipments: [shipment],
    });

    // Act
    store.getState().reserveRequest("r1");
    const again = store.getState().reserveRequest("r1");

    // Assert
    expect(again).toBe(shipment.id);
    expect(store.getState().expectedShipments[0].lines[0].reservedFor).toEqual(["r1"]);
  });
});

describe("releaseReservation", () => {
  it("снимает бронь и со строки поставки, и с заявки", () => {
    // Arrange
    const line = makeShipmentLine({ productId: "p1", expectedQty: 10 });
    const store = makeRequestsStore({
      requests: [makeRequest({ id: "r1", productId: "p1", qty: 2 })],
      expectedShipments: [makeShipment({ lines: [line] })],
    });
    store.getState().reserveRequest("r1");

    // Act
    store.getState().releaseReservation("r1");

    // Assert
    expect(store.getState().expectedShipments[0].lines[0].reservedFor).toEqual([]);
    expect(store.getState().requests[0].reservedShipmentId).toBeUndefined();
  });

  it("после снятия брони количество снова доступно другой заявке", () => {
    // Arrange: строка на 5, первая заявка держит 3 — второй сначала не хватает.
    const line = makeShipmentLine({ productId: "p1", expectedQty: 5 });
    const store = makeRequestsStore({
      requests: [
        makeRequest({ id: "r1", productId: "p1", qty: 3 }),
        makeRequest({ id: "r2", productId: "p1", qty: 3 }),
      ],
      expectedShipments: [makeShipment({ lines: [line] })],
    });
    store.getState().reserveRequest("r1");

    // Act
    store.getState().releaseReservation("r1");
    const second = store.getState().reserveRequest("r2");

    // Assert
    expect(second).not.toBeNull();
  });

  it("молча ничего не делает, если брони не было", () => {
    // Arrange
    const store = makeRequestsStore({
      requests: [makeRequest({ id: "r1", productId: "p1", qty: 2 })],
      expectedShipments: [],
    });
    const before = store.getState().requests;

    // Act
    store.getState().releaseReservation("r1");
    store.getState().releaseReservation("нет-такой-заявки");

    // Assert
    expect(store.getState().requests).toBe(before);
  });
});

describe("applyCrossDock", () => {
  it("сначала закрывает заявку, забронированную под эту поставку", () => {
    // Arrange: чужая заявка старше, но эту коробку ждала именно «своя».
    const store = makeRequestsStore({
      requests: [
        makeRequest({ id: "старая", productId: "p1", qty: 2, createdAt: 100 }),
        makeRequest({
          id: "своя",
          productId: "p1",
          qty: 2,
          createdAt: 200,
          reservedShipmentId: "ship-1",
        }),
      ],
      expectedShipments: [],
    });

    // Act
    const used = store.getState().applyCrossDock("p1", 2, "ship-1");

    // Assert
    expect(used).toBe(2);
    const byId = Object.fromEntries(store.getState().requests.map((r) => [r.id, r]));
    expect(byId["своя"].status).toBe("done");
    expect(byId["старая"].status).toBe("new");
  });

  it("при равных условиях закрывает заявки в порядке появления", () => {
    // Arrange
    const store = makeRequestsStore({
      requests: [
        makeRequest({ id: "поздняя", productId: "p1", qty: 1, createdAt: 200 }),
        makeRequest({ id: "ранняя", productId: "p1", qty: 1, createdAt: 100 }),
      ],
      expectedShipments: [],
    });

    // Act
    store.getState().applyCrossDock("p1", 1);

    // Assert
    const byId = Object.fromEntries(store.getState().requests.map((r) => [r.id, r]));
    expect(byId["ранняя"].status).toBe("done");
    expect(byId["поздняя"].status).toBe("new");
  });

  it("возвращает израсходованное количество и не берёт лишнего", () => {
    // Arrange: приехало 10, а нужно всего 3 — остальное едет на полку.
    const store = makeRequestsStore({
      requests: [makeRequest({ id: "r1", productId: "p1", qty: 3 })],
      expectedShipments: [],
    });

    // Act
    const used = store.getState().applyCrossDock("p1", 10);

    // Assert
    expect(used).toBe(3);
    expect(store.getState().requests[0].pickedQty).toBe(3);
  });

  it("недобор оставляет заявку в работе, а не закрывает её", () => {
    // Arrange
    const store = makeRequestsStore({
      requests: [makeRequest({ id: "r1", productId: "p1", qty: 5 })],
      expectedShipments: [],
    });

    // Act
    const used = store.getState().applyCrossDock("p1", 2);

    // Assert
    expect(used).toBe(2);
    expect(store.getState().requests[0].status).toBe("in_progress");
    expect(store.getState().requests[0].pickedQty).toBe(2);
  });

  it("не трогает отменённые и уже собранные заявки", () => {
    // Arrange
    const store = makeRequestsStore({
      requests: [
        makeRequest({ id: "отменена", productId: "p1", qty: 5, status: "cancelled" }),
        makeRequest({ id: "собрана", productId: "p1", qty: 5, status: "done" }),
      ],
      expectedShipments: [],
    });

    // Act
    const used = store.getState().applyCrossDock("p1", 5);

    // Assert
    expect(used).toBe(0);
    expect(store.getState().requests.map((r) => r.status)).toEqual(["cancelled", "done"]);
  });

  it("закрытая кроссдоком заявка отпускает свою бронь", () => {
    // Arrange: иначе строка поставки навсегда осталась бы «продана».
    const line = makeShipmentLine({ productId: "p1", expectedQty: 10 });
    const shipment = makeShipment({ lines: [line] });
    const store = makeRequestsStore({
      requests: [makeRequest({ id: "r1", productId: "p1", qty: 2 })],
      expectedShipments: [shipment],
    });
    store.getState().reserveRequest("r1");

    // Act
    store.getState().applyCrossDock("p1", 2, shipment.id);

    // Assert
    expect(store.getState().requests[0].status).toBe("done");
    expect(store.getState().expectedShipments[0].lines[0].reservedFor).toEqual([]);
  });

  it("нулевое и отрицательное количество ничего не расходует", () => {
    // Arrange
    const store = makeRequestsStore({
      requests: [makeRequest({ id: "r1", productId: "p1", qty: 5 })],
      expectedShipments: [],
    });

    // Act
    const zero = store.getState().applyCrossDock("p1", 0);
    const negative = store.getState().applyCrossDock("p1", -3);

    // Assert
    expect(zero).toBe(0);
    expect(negative).toBe(0);
    expect(store.getState().requests[0].status).toBe("new");
  });
});
