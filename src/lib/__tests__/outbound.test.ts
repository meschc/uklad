import { describe, expect, it } from "vitest";
import {
  addToOutbound,
  classifyLoadScan,
  expectedOutbound,
  missingOutbound,
  shipOutbound,
} from "../outbound";
import type { OutboundBox } from "../types";

/**
 * Короба отгрузки как данные. Ошибка здесь молчит: короб на Тулу уезжает в
 * машину на Самару, а заметно это становится по жалобе через неделю. Поэтому
 * проверяем, что состав копится, что чужой короб не принимается и что
 * оставшийся у стола короб виден до отгрузки.
 */

let seq = 0;
const newId = () => `out-${++seq}`;

function box(patch: Partial<OutboundBox> = {}): OutboundBox {
  return {
    id: newId(),
    code: "UK-OUT-AAA111",
    lines: [{ productId: "p1", qty: 2 }],
    requestIds: ["r1"],
    packedBy: ["s1"],
    createdAt: 1,
    updatedAt: 1,
    ...patch,
  };
}

describe("addToOutbound", () => {
  it("копит состав, когда в один короб пакуют вторую тару", () => {
    // Arrange
    const first = addToOutbound([], {
      code: "uk-out-aaa111",
      lines: [{ productId: "p1", qty: 2 }],
      requestIds: ["r1"],
      staffId: "s1",
      at: 10,
      newId,
    });

    // Act
    const second = addToOutbound(first, {
      code: "UK-OUT-AAA111",
      lines: [
        { productId: "p1", qty: 1 },
        { productId: "p2", qty: 3 },
      ],
      requestIds: ["r2"],
      staffId: "s2",
      at: 20,
      newId,
    });

    // Assert: один короб, а не два, код в одном регистре.
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({
      code: "UK-OUT-AAA111",
      lines: [
        { productId: "p1", qty: 3 },
        { productId: "p2", qty: 3 },
      ],
      requestIds: ["r1", "r2"],
      packedBy: ["s1", "s2"],
      createdAt: 10,
      updatedAt: 20,
    });
  });

  it("тот же код после отгрузки открывает новый короб, а не дописывает уехавший", () => {
    // Arrange: этикетка назначения одна на адрес и печатается снова.
    const gone = box({ shipmentId: "ship1", shippedAt: 5 });

    // Act
    const out = addToOutbound([gone], {
      code: gone.code,
      lines: [{ productId: "p9", qty: 1 }],
      requestIds: ["r9"],
      staffId: "s1",
      at: 30,
      newId,
    });

    // Assert
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual(gone);
    expect(out[1]).toMatchObject({ lines: [{ productId: "p9", qty: 1 }], requestIds: ["r9"] });
    expect(out[1].shipmentId).toBeUndefined();
  });

  it("пустую тару в короб не записывает", () => {
    const out = addToOutbound([], {
      code: "UK-OUT-AAA111",
      lines: [{ productId: "p1", qty: 0 }],
      requestIds: [],
      staffId: "s1",
      at: 1,
      newId,
    });
    expect(out).toEqual([]);
  });
});

describe("погрузка по коробам", () => {
  const tula = box({ code: "UK-OUT-TULA01", requestIds: ["r1", "r2"] });
  const samara = box({ code: "UK-OUT-SAMA01", requestIds: ["r5"] });
  const fbo = box({ code: "UK-OUT-FBO001", requestIds: [] });
  const list = [tula, samara, fbo];

  it("ждёт короба, где лежит хотя бы одна заявка назначения", () => {
    expect(expectedOutbound(list, ["r2", "r3"]).map((b) => b.code)).toEqual(["UK-OUT-TULA01"]);
  });

  it("не пускает в машину короб другого назначения", () => {
    // Act
    const res = classifyLoadScan(list, ["r1", "r2"], [], "uk-out-sama01");

    // Assert
    expect(res).toMatchObject({ kind: "foreign", code: "UK-OUT-SAMA01" });
  });

  it("принимает свой короб, короб без заказов и тару без записи", () => {
    const ids = ["r1", "r2"];
    expect(classifyLoadScan(list, ids, [], "UK-OUT-TULA01")).toMatchObject({
      kind: "ok",
      box: tula,
    });
    expect(classifyLoadScan(list, ids, [], "UK-OUT-FBO001").kind).toBe("ok");
    // Код нормализуется: «UK-PLT-0007» и «UK-PLT-7» — один ярлык и один скан.
    expect(classifyLoadScan(list, ids, [], "UK-PLT-0007")).toEqual({
      kind: "ok",
      code: "UK-PLT-7",
    });
    expect(classifyLoadScan(list, ids, ["UK-PLT-7"], "uk-plt-007").kind).toBe("dup");
  });

  it("второй скан того же короба и уехавший короб — ошибка", () => {
    const gone = box({ code: "UK-OUT-OLD001", shipmentId: "ship1" });
    expect(classifyLoadScan([gone], ["r1"], ["UK-OUT-TULA01"], "UK-OUT-TULA01").kind).toBe("dup");
    expect(classifyLoadScan([gone], ["r1"], [], "UK-OUT-OLD001").kind).toBe("shipped");
    expect(classifyLoadScan(list, ["r1"], [], "4601234567890").kind).toBe("not_unit");
  });

  it("показывает короб назначения, который остался у стола", () => {
    // Arrange
    const second = box({ code: "UK-OUT-TULA02", requestIds: ["r3"] });
    const expected = expectedOutbound([tula, second], ["r1", "r3"]);

    // Act
    const missing = missingOutbound(expected, ["uk-out-tula01"]);

    // Assert
    expect(missing.map((b) => b.code)).toEqual(["UK-OUT-TULA02"]);
  });

  it("рейс закрывает только погруженные короба", () => {
    // Act
    const out = shipOutbound(list, ["UK-OUT-TULA01", "UK-PLT-0007"], "ship7", 99);

    // Assert
    const byCode = Object.fromEntries(out.map((b) => [b.code, b]));
    expect(byCode["UK-OUT-TULA01"]).toMatchObject({ shipmentId: "ship7", shippedAt: 99 });
    expect(byCode["UK-OUT-SAMA01"].shipmentId).toBeUndefined();
  });
});
