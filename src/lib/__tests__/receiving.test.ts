import { describe, expect, it } from "vitest";
import { EMPTY_RECEIVING, resumeProgress } from "../receiving";
import type { Box, ExpectedShipment, Pallet, ReceivingProgress } from "../types";

/**
 * Возвращение в мастер приёмки (п.4.7).
 *
 * Ход хранится ссылками на записи склада, а отлучка бывает долгой: напарник
 * сдал поставку, тара уехала на место, браузер перезагрузился. Всё, что здесь
 * проверяется, — что мастер не открывается на шаге, под которым уже ничего нет:
 * такой шаг не падает, он молча ничего не рисует, и человек видит пустой экран
 * вместо работы.
 */

const OPEN_BOX: Box = { id: "box-1", barcode: "УК-BOX-000001", createdAt: 1, lines: [] };
const PLACED_BOX: Box = {
  ...OPEN_BOX,
  id: "box-2",
  address: { floorId: "f1", moduleId: "m1", shelfIndex: 0, cellIndex: 0 },
};
const PALLET: Pallet = { id: "plt-1", barcode: "УК-PLT-000001", createdAt: 1, boxIds: [] };
const SHIPMENT: ExpectedShipment = {
  id: "ship-1",
  source: "manual",
  lines: [],
  createdAt: 1,
  status: "receiving",
};

const DATA = { expectedShipments: [SHIPMENT], boxes: [OPEN_BOX, PLACED_BOX], pallets: [PALLET] };

/** Ход посреди приёмки: поставка выбрана, паллета и тара открыты. */
function saved(patch: Partial<ReceivingProgress> = {}): ReceivingProgress {
  return {
    step: "product",
    shipmentId: SHIPMENT.id,
    staffId: "staff-1",
    palletId: PALLET.id,
    boxId: OPEN_BOX.id,
    received: 7,
    ...patch,
  };
}

describe("resumeProgress", () => {
  it("возвращает мастер туда же, если за время отлучки ничего не изменилось", () => {
    // Arrange
    const progress = saved();

    // Act
    const resumed = resumeProgress(progress, DATA);

    // Assert
    expect(resumed).toEqual(progress);
  });

  it("откатывает шаг количества на скан товара", () => {
    // Arrange — опознанный товар живёт только в памяти экрана
    const progress = saved({ step: "qty" });

    // Act
    const resumed = resumeProgress(progress, DATA);

    // Assert
    expect(resumed.step).toBe("product");
    expect(resumed.boxId).toBe(OPEN_BOX.id);
  });

  it("начинает приёмку заново, если поставку успели сдать", () => {
    // Arrange
    const closed = { ...DATA, expectedShipments: [{ ...SHIPMENT, status: "closed" as const }] };

    // Act
    const resumed = resumeProgress(saved(), closed);

    // Assert — сверять не с чем, но кладовщик за смену не сменился
    expect(resumed).toEqual({ ...EMPTY_RECEIVING, staffId: "staff-1" });
  });

  it("начинает заново, если поставки больше нет вовсе", () => {
    // Arrange · Act
    const resumed = resumeProgress(saved(), { ...DATA, expectedShipments: [] });

    // Assert
    expect(resumed.step).toBe("shipment");
    expect(resumed.shipmentId).toBeNull();
  });

  it("не трогает свободную приёмку без поставки", () => {
    // Arrange — принимают без сверки, и это не потерянная поставка
    const progress = saved({ shipmentId: null });

    // Act
    const resumed = resumeProgress(progress, DATA);

    // Assert
    expect(resumed).toEqual(progress);
  });

  it("возвращает к таре, если открытая уехала на место", () => {
    // Arrange
    const progress = saved({ boxId: PLACED_BOX.id, step: "place" });

    // Act
    const resumed = resumeProgress(progress, DATA);

    // Assert — доливать в размещённую тару нельзя, нужна новая
    expect(resumed.boxId).toBeNull();
    expect(resumed.step).toBe("box");
  });

  it("держит шаг паллеты, даже когда тары нет", () => {
    // Arrange
    const progress = saved({ step: "pallet", boxId: null });

    // Act
    const resumed = resumeProgress(progress, DATA);

    // Assert — паллета тары не требует
    expect(resumed.step).toBe("pallet");
  });

  it("забывает паллету, которой больше нет, но приёмку не прерывает", () => {
    // Arrange · Act
    const resumed = resumeProgress(saved(), { ...DATA, pallets: [] });

    // Assert — паллета лишь группирует тару, работа без неё продолжается
    expect(resumed.palletId).toBeNull();
    expect(resumed.step).toBe("product");
  });

  it("начинает заново, если в хранилище лежала ерунда", () => {
    // Arrange — шов с localStorage: сюда приходит что угодно
    const broken = { ...saved(), step: "чепуха" } as unknown as ReceivingProgress;

    // Act
    const resumed = resumeProgress(broken, DATA);

    // Assert
    expect(resumed).toEqual(EMPTY_RECEIVING);
    expect(resumeProgress(null, DATA)).toEqual(EMPTY_RECEIVING);
  });
});
