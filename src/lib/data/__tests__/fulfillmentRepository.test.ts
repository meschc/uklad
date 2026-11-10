import { describe, expect, it, vi } from "vitest";
import { makeBox, makeShipment, makeShipmentLine } from "../../__tests__/fixtures";
import type { EditorState } from "../../store/state";
import type { StorePort } from "../repository";
import { createFulfillmentRepository } from "../fulfillmentRepository";
import type { DeskOpBody } from "../opQueue";

/**
 * Репозиторий приёмки через подменённый порт — ни стора, ни `localStorage`.
 *
 * Проверяем не «стор посчитал правильно» (это дело тестов среза), а сам шов:
 * что аргументы доходят до действия без потерь, что падение превращается в
 * отказ, а не в исключение посреди мастера приёмки, и что «ничего не нашлось»
 * остаётся успехом. Именно на эти три вещи опирается экран, решая, вести ли
 * кладовщика на следующий шаг.
 */

function fakePort(state: Partial<EditorState>): StorePort {
  return {
    get: () => state as EditorState,
    set: () => {},
  };
}

describe("createFulfillmentRepository", () => {
  it("отдаёт список ожидаемых поставок из порта", async () => {
    // Arrange
    const ship = makeShipment({ lines: [makeShipmentLine()] });
    const repo = createFulfillmentRepository(fakePort({ expectedShipments: [ship] }));

    // Act
    const res = await repo.listShipments();

    // Assert
    expect(res).toEqual({ ok: true, data: [ship] });
  });

  it("выбрасывает поставки неверной формы, но остальные отдаёт", async () => {
    // Arrange: одна битая запись в хранилище не повод спрятать всю приёмку.
    const good = makeShipment();
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const repo = createFulfillmentRepository(
      fakePort({ expectedShipments: [good, { id: "" } as never] }),
    );

    // Act
    const res = await repo.listShipments();

    // Assert
    expect(res).toEqual({ ok: true, data: [good] });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("на отсутствующей поставке отвечает успехом с null, а не отказом", async () => {
    // Arrange: «такой поставки нет» — ответ, а не сбой: экран уводит на список.
    const repo = createFulfillmentRepository(fakePort({ expectedShipments: [] }));

    // Act
    const res = await repo.getShipment("нет-такой");

    // Assert
    expect(res).toEqual({ ok: true, data: null });
  });

  it("передаёт создание поставки со всеми параметрами и отдаёт выданный id", async () => {
    // Arrange: кроссдок и название — не украшение, а признаки, по которым
    // приёмка потом решает, лежит товар на полке или уезжает с рампы.
    const createExpectedShipment = vi.fn(() => "ship-new");
    const repo = createFulfillmentRepository(fakePort({ createExpectedShipment }));
    const lines = [{ productId: "prod-1", expectedQty: 10 }];

    // Act
    const res = await repo.createShipment("manual", lines, "Партия №7", { crossDock: true });

    // Assert
    expect(createExpectedShipment).toHaveBeenCalledWith("manual", lines, "Партия №7", {
      crossDock: true,
    });
    expect(res).toEqual({ ok: true, data: "ship-new" });
  });

  it("передаёт приёмку товара в стор целиком, вместе с расхождением", async () => {
    // Arrange: расхождение теряться не должно — на нём держится вся сверка.
    const receiveProduct = vi.fn(() => "evt-1");
    const repo = createFulfillmentRepository(fakePort({ receiveProduct }));
    const input = { productId: "prod-1", qty: 8, boxId: "box-1", discrepancy: "shortage" as const };

    // Act
    const res = await repo.receive(input);

    // Assert
    expect(receiveProduct).toHaveBeenCalledWith(input);
    expect(res).toEqual({ ok: true, data: "evt-1" });
  });

  it("превращает падение приёмки в отказ, а не в исключение наружу", async () => {
    // Arrange: мастер приёмки обязан остаться на шаге, а не упасть целиком.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const repo = createFulfillmentRepository(
      fakePort({
        receiveProduct: () => {
          throw new Error("сервер недоступен");
        },
      }),
    );

    // Act
    const res = await repo.receive({ productId: "prod-1", qty: 1, boxId: "box-1" });

    // Assert
    expect(res).toEqual({ ok: false, error: "data.failed" });
    spy.mockRestore();
  });

  it("отдаёт новую тару целиком: экрану нужен и id, и штрихкод", async () => {
    // Arrange: id уходит в состояние мастера, штрихкод — человеку на ярлык.
    const box = makeBox();
    const repo = createFulfillmentRepository(fakePort({ createBox: () => box }));

    // Act
    const res = await repo.createBox();

    // Assert
    expect(res).toEqual({ ok: true, data: box });
  });

  it("передаёт постановку тары на место вместе с адресом", async () => {
    // Arrange
    const placeBox = vi.fn();
    const repo = createFulfillmentRepository(fakePort({ placeBox }));
    const addr = { floorId: "f1", moduleId: "m1", shelfIndex: 0, cellIndex: 2 };

    // Act
    const res = await repo.placeBox("box-1", addr);

    // Assert
    expect(placeBox).toHaveBeenCalledWith("box-1", addr);
    expect(res.ok).toBe(true);
  });

  it("передаёт привязку тары к паллете", async () => {
    // Arrange
    const attachBoxToPallet = vi.fn();
    const repo = createFulfillmentRepository(fakePort({ attachBoxToPallet }));

    // Act
    const res = await repo.attachBox("box-1", "plt-1");

    // Assert
    expect(attachBoxToPallet).toHaveBeenCalledWith("box-1", "plt-1");
    expect(res.ok).toBe(true);
  });

  it("кроссдок без подходящих заявок — успех с нулём, а не отказ", async () => {
    // Arrange: разбирать нечего — обычный исход, товар просто поедет на полку.
    const repo = createFulfillmentRepository(fakePort({ applyCrossDock: () => 0 }));

    // Act
    const res = await repo.crossDock("prod-1", 5, "ship-1");

    // Assert
    expect(res).toEqual({ ok: true, data: 0 });
  });

  it("передаёт кроссдок с поставкой и тарой приёмки и отдаёт, сколько ушло", async () => {
    // Arrange
    const applyCrossDock = vi.fn(() => 3);
    const repo = createFulfillmentRepository(fakePort({ applyCrossDock }));

    // Act
    const res = await repo.crossDock("prod-1", 5, "ship-1", "box-1");

    // Assert
    expect(applyCrossDock).toHaveBeenCalledWith("prod-1", 5, "ship-1", "box-1");
    expect(res).toEqual({ ok: true, data: 3 });
  });

  it("передаёт закрытие поставки в стор", async () => {
    // Arrange
    const closeShipment = vi.fn();
    const repo = createFulfillmentRepository(fakePort({ closeShipment }));

    // Act
    const res = await repo.closeShipment("ship-1");

    // Assert
    expect(closeShipment).toHaveBeenCalledWith("ship-1");
    expect(res.ok).toBe(true);
  });
});

describe("приёмка со стола на сервере уходит операциями", () => {
  const queue = () => ({
    enqueue: vi.fn(),
    flush: vi.fn(async () => {}),
    pending: () => ({ count: 0, since: null }),
    subscribe: () => () => {},
    sendNow: vi.fn(async () => ({ kind: "local" as const })),
  });
  const cell = { floorId: "f1", moduleId: "m1", shelfIndex: 0, cellIndex: 1 };
  // Тот же объект, что у стора: действие правит его, репозиторий читает его же.
  const desk = (state: Partial<EditorState>, server = true) =>
    fakePort(
      Object.assign(state, {
        session: { source: server ? "server" : "local" } as EditorState["session"],
        stationSession: {
          staffId: "stf-ivan",
          station: "receiving",
        } as EditorState["stationSession"],
      }),
    );

  it("принятое уходит тем же id события, что в журнале приёмки, с числом из стора", async () => {
    const q = queue();
    const state: Partial<EditorState> = {
      receivingEvents: [],
      receiveProduct: vi.fn(() => {
        state.receivingEvents = [
          { id: "recv_1", productId: "p1", qty: 2, boxId: "b1", timestamp: 7 },
        ] as EditorState["receivingEvents"];
        return "recv_1";
      }),
      placeBox: vi.fn(),
      openUnit: vi.fn(),
    };
    const repo = createFulfillmentRepository(desk(state), q);
    await repo.openUnit("b1");
    await repo.receive({ productId: "p1", qty: 2.4, boxId: "b1", shipmentId: "s1", lineId: "l1" });
    await repo.placeBox("b1", cell);
    expect(q.enqueue.mock.calls.map((c) => c[0])).toEqual(["recv_open", "recv_unit", "recv_place"]);
    expect(q.enqueue.mock.calls[1][1]).toEqual({
      eventId: "recv_1",
      staffId: "stf-ivan",
      at: 7,
      productId: "p1",
      qty: 2,
      boxId: "b1",
      shipmentId: "s1",
      lineId: "l1",
      discrepancy: undefined,
    });
    expect(q.enqueue.mock.calls[2][1]).toMatchObject({ boxId: "b1", cell, staffId: "stf-ivan" });
  });

  it("в демо и в кабинете без стола очереди нет", async () => {
    const q = queue();
    await createFulfillmentRepository(desk({ openUnit: vi.fn() }, false), q).openUnit("b1");
    await createFulfillmentRepository(
      fakePort({ session: { source: "server" } as EditorState["session"], openUnit: vi.fn() }),
      q,
    ).openUnit("b1");
    expect(q.enqueue).not.toHaveBeenCalled();
  });

  it("грузовая приёмка ждёт номера мест от сервера и повторяет тем же ключом", async () => {
    const q = queue();
    const made = {
      pallets: [{ id: "cargo_1-p0", barcode: "UK-PLT-41" }],
      boxes: [{ id: "cargo_1-b0", barcode: "UK-BOX-90" }],
    };
    q.sendNow.mockResolvedValueOnce({ kind: "fail" } as never).mockResolvedValueOnce({
      kind: "ok",
      result: { key: "x", status: "applied", made },
    } as never);
    const acceptCargo = vi.fn(() => ({ palletIds: ["cargo_1-p0"], boxIds: ["cargo_1-b0"] }));
    const repo = createFulfillmentRepository(desk({ acceptCargo }), q);
    const input = {
      shipmentId: "s1",
      pallets: 1,
      boxes: 1,
      declaredPallets: 2,
      staffId: "stf-ivan",
    };

    // Обрыв: в стор ничего не легло, форма остаётся с повтором.
    expect(await repo.acceptCargo(input)).toEqual({ ok: false, error: "data.failed" });
    expect(acceptCargo).not.toHaveBeenCalled();
    const res = await repo.acceptCargo(input);
    expect(res.ok).toBe(true);
    // Тот же ключ и то же событие: сервер не заведёт места второй раз.
    const [first, second] = q.sendNow.mock.calls as unknown as [string, string, DeskOpBody][];
    expect(second[0]).toBe(first[0]);
    expect(second[2]).toEqual(first[2]);
    expect(first[1]).toBe("recv_cargo");
    expect(first[2]).toMatchObject({ shipmentId: "s1", pallets: 1, boxes: 1, declaredPallets: 2 });
    // Стор берёт места сервера, а не заводит свои.
    expect(acceptCargo).toHaveBeenCalledWith(expect.objectContaining({ made, at: first[2].at }));
  });

  it("сервер не принял места — отказ, в стор ничего не легло", async () => {
    const q = queue();
    q.sendNow.mockResolvedValueOnce({
      kind: "ok",
      result: { key: "x", status: "flagged", reason: "bad" },
    } as never);
    const acceptCargo = vi.fn();
    const repo = createFulfillmentRepository(desk({ acceptCargo }), q);
    const res = await repo.acceptCargo({ shipmentId: "s1", pallets: 1, boxes: 0 });
    expect(res).toEqual({ ok: false, error: "cargo.rejected" });
    expect(acceptCargo).not.toHaveBeenCalled();
  });
});
