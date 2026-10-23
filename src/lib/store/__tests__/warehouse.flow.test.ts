import { describe, expect, it } from "vitest";
import { cargoDiff, sealedUnits } from "../../cargo";
import { operationLog, serviceReport } from "../../operations";
import { makeProduct } from "../../__tests__/fixtures";
import type { CellAddress } from "../../types";
import { makeFlowStore } from "./harness";

/**
 * Сквозной сценарий склада «от приёмки до отгрузки» (документ
 * uklad-leads/warehouse-processes-2026-10-21.md, §4) на уровне данных.
 *
 * Шаги идут в том порядке, в котором их делают люди на складе. Каждый шаг
 * проверяет то, что увидел бы следующий участник: продавец — расхождение по
 * местам, сборщик — товар в ячейке, бухгалтер — строки в отчёте услуг.
 */

const A = makeProduct({ id: "p-a", partnerId: "seller" });
const B = makeProduct({ id: "p-b", partnerId: "seller" });
const CELL: CellAddress = { floorId: "f1", moduleId: "m1", shelfIndex: 0, cellIndex: 0 };

describe("склад от приёмки до отгрузки, приёмка в два этапа", () => {
  it("проходит весь путь и даёт отчёт по услугам", () => {
    const store = makeFlowStore({ products: [A, B], placements: {}, showToast: () => {} });
    const s = () => store.getState();
    s().setTwoStageReceiving(true);

    // 1. Продавец везёт товар: две строки поставки.
    const shipId = s().createExpectedShipment("manual", [
      { productId: "p-a", expectedQty: 10 },
      { productId: "p-b", expectedQty: 4 },
    ]);

    // 2. Грузовая приёмка: по накладной 1 паллета и 2 короба, короб потерялся.
    s().acceptCargo({
      shipmentId: shipId,
      pallets: 1,
      boxes: 1,
      declaredPallets: 1,
      declaredBoxes: 2,
      staffId: "st-1",
    });
    const shipment = s().expectedShipments.find((x) => x.id === shipId)!;
    expect(shipment.status).toBe("receiving");
    expect(cargoDiff(shipment.cargo!)).toEqual({ pallets: 0, boxes: -1 });

    // 3. Места ждут вскрытия; товара в остатках ещё нет.
    let waiting = sealedUnits(shipId, s().pallets, s().boxes);
    expect(waiting.pallets).toHaveLength(1);
    expect(waiting.boxes).toHaveLength(1);
    expect(s().boxes.every((b) => b.lines.length === 0)).toBe(true);

    // 4. Товарная приёмка: вскрыли паллету, разложили товар в новый короб.
    const pallet = waiting.pallets[0];
    s().openUnit(pallet.id);
    const inner = s().createBox();
    const lineA = shipment.lines.find((l) => l.productId === "p-a")!;
    s().receiveProduct({
      productId: "p-a",
      qty: 10,
      boxId: inner.id,
      shipmentId: shipId,
      lineId: lineA.id,
      staffId: "st-2",
    });
    s().attachBoxToPallet(inner.id, pallet.id);
    s().placeBox(inner.id, CELL);

    // Отдельный короб вскрыли — в нём 3 из 4 штук второго товара.
    const loose = waiting.boxes[0];
    s().openUnit(loose.id);
    const lineB = shipment.lines.find((l) => l.productId === "p-b")!;
    s().receiveProduct({
      productId: "p-b",
      qty: 3,
      boxId: loose.id,
      shipmentId: shipId,
      lineId: lineB.id,
      discrepancy: "shortage",
    });
    waiting = sealedUnits(shipId, s().pallets, s().boxes);
    expect(waiting.pallets.length + waiting.boxes.length).toBe(0);

    // 5. Маркировка — заданием, закрыли.
    const mark = s().createTask({ kind: "marking", qty: 13, partnerId: "seller" });
    s().setTaskStatus(mark, "done");

    // 6–9. Заявка продавца: сборка из ячейки.
    const reqId = s().createRequest({ productId: "p-a", qty: 2, note: "WB Коледино" });
    s().startPicking(reqId);
    s().recordPick(reqId, "p-a", CELL);
    expect(s().recordPick(reqId, "p-a", CELL)).toBe(2);
    s().completeRequest(reqId);
    expect(s().boxes.find((b) => b.id === inner.id)!.lines[0].qty).toBe(8);

    // 10. Упаковка — заданием.
    const pack = s().createTask({ kind: "packing", qty: 1, partnerId: "seller" });
    s().setTaskStatus(pack, "done");

    // 11–12. Погрузка рейсом.
    expect(s().shipRequests([reqId], { vehicle: "А123ВС" })).not.toBeNull();
    expect(s().requests[0].status).toBe("shipped");

    // 14. Отчёт по услугам продавцу.
    const log = operationLog({
      tasks: s().tasks,
      pallets: s().pallets,
      boxes: s().boxes,
      receivingEvents: s().receivingEvents,
      requests: s().requests,
      shipments: s().shipments,
      products: [A, B],
    });
    const report = serviceReport(
      log,
      {
        enabled: {},
        prices: { cargo_pallet: 150, cargo_box: 25, item_receiving: 4, picking: 5, loading: 900 },
      },
      { from: 0, to: Number.MAX_SAFE_INTEGER },
    );
    const qty = Object.fromEntries(report.rows.map((r) => [r.kind, r.qty]));
    expect(qty).toEqual({
      cargo_pallet: 1,
      cargo_box: 2, // короб с рампы и короб, в который разложили паллету
      item_receiving: 13,
      marking: 13,
      picking: 2,
      packing: 1,
      loading: 1,
    });
    // Маркировка и упаковка без цены — итог помечен неполным.
    expect(report.unpriced).toBe(true);
    expect(report.total).toBe(150 + 2 * 25 + 13 * 4 + 2 * 5 + 900);
  });

  it("вторая машина по той же поставке докладывает места, а не затирает их", () => {
    const store = makeFlowStore({ products: [A] });
    const s = () => store.getState();
    const id = s().createExpectedShipment("manual", [{ productId: "p-a", expectedQty: 1 }]);
    s().acceptCargo({ shipmentId: id, pallets: 2, boxes: 0, declaredPallets: 3 });
    s().acceptCargo({ shipmentId: id, pallets: 1, boxes: 0 });
    const cargo = s().expectedShipments[0].cargo!;
    expect(cargo.pallets).toBe(3);
    expect(cargoDiff(cargo).pallets).toBe(0);
    expect(new Set(s().pallets.map((p) => p.barcode)).size).toBe(3);
  });
});
