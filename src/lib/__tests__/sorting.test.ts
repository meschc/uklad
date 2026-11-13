import { describe, expect, it } from "vitest";
import { classifySortScan, sortPallets, unsorted } from "../sorting";
import type { FulfillmentRequest, OutboundBox } from "../types";

/**
 * Сортировка посылок по паллетам: посылка не должна лечь на паллету чужого
 * склада, а повторный скан — пройти молча.
 */
const req = (id: string, note: string) => ({ id, note }) as unknown as FulfillmentRequest;
const box = (code: string, requestIds: string[], over: Partial<OutboundBox> = {}) =>
  ({ id: code, code, requestIds, ...over }) as unknown as OutboundBox;

const requests = [req("r1", "WB Коледино"), req("r2", "WB Коледино"), req("r3", "Ozon Хоругвино")];

describe("classifySortScan", () => {
  const list = [
    box("UK-OUT-1", ["r1"], { palletCode: "UK-PLT-A" }),
    box("UK-OUT-2", ["r2"]),
    box("UK-OUT-3", ["r3"]),
    box("UK-OUT-4", ["r1", "r3"]),
  ];

  it("посылка показывает назначение, паллета своего назначения принимает", () => {
    expect(classifySortScan(list, requests, null, "uk-out-2")).toMatchObject({
      kind: "parcel",
      destination: "WB Коледино",
    });
    expect(classifySortScan(list, requests, "UK-OUT-2", "UK-PLT-A").kind).toBe("placed");
    expect(classifySortScan(list, requests, "UK-OUT-2", "UK-PLT-NEW").kind).toBe("placed");
  });

  it("паллета другого назначения — отказ с её назначением", () => {
    expect(classifySortScan(list, requests, "UK-OUT-3", "UK-PLT-A")).toMatchObject({
      kind: "wrong_pallet",
      palletDestination: "WB Коледино",
    });
  });

  it("повтор, порядок сканов и посылка в два места", () => {
    expect(classifySortScan(list, requests, null, "UK-OUT-1").kind).toBe("dup");
    expect(classifySortScan(list, requests, null, "UK-PLT-A").kind).toBe("pallet_first");
    expect(classifySortScan(list, requests, "UK-OUT-2", "UK-OUT-3").kind).toBe("parcel_pending");
    expect(classifySortScan(list, requests, null, "UK-OUT-4").kind).toBe("no_destination");
    expect(classifySortScan(list, requests, null, "UK-OUT-9").kind).toBe("unknown");
  });

  it("списки: что разложено и что ещё нет", () => {
    expect(sortPallets(list, requests)).toEqual([
      { pallet: "UK-PLT-A", destination: "WB Коледино", count: 1 },
    ]);
    expect(unsorted(list, requests).map((x) => x.box.code)).toEqual(["UK-OUT-2", "UK-OUT-3"]);
  });
});
