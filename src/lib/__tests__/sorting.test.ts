import { describe, expect, it } from "vitest";
import {
  classifySortScan,
  currentSortPoint,
  placeCodes,
  shipmentOfPlace,
  sortPointCode,
  sortPoints,
  unsorted,
} from "../sorting";
import type { FulfillmentRequest, OutboundBox } from "../types";

/**
 * Сортировка по местам отгрузки (UK-SORT): посылка не должна лечь в место
 * чужого направления или в закрытую отгрузку, а повторный скан — пройти молча.
 */
const req = (id: string, note: string) => ({ id, note }) as unknown as FulfillmentRequest;
const box = (code: string, requestIds: string[], over: Partial<OutboundBox> = {}) =>
  ({ id: code, code, requestIds, lines: [], ...over }) as unknown as OutboundBox;

const KOL = "WB Коледино";
const requests = [req("r1", KOL), req("r2", KOL), req("r3", "Ozon Хоругвино")];
const P1 = sortPointCode(KOL, 1);

describe("classifySortScan", () => {
  const list = [
    box("UK-ORD-1", ["r1"], { sortCode: P1 }),
    box("UK-ORD-2", ["r2"]),
    box("UK-LBL-3", ["r3"]),
    box("UK-OUT-4", ["r1", "r3"]),
  ];

  it("посылка показывает направление и текущее место, место своего направления принимает", () => {
    expect(classifySortScan(list, requests, null, "uk-ord-2")).toMatchObject({
      kind: "parcel",
      destination: KOL,
      point: P1,
    });
    expect(classifySortScan(list, requests, "UK-ORD-2", P1).kind).toBe("placed");
  });

  it("место другого направления — отказ с его направлением", () => {
    expect(classifySortScan(list, requests, "UK-LBL-3", P1)).toMatchObject({
      kind: "wrong_point",
      pointDestination: KOL,
    });
  });

  it("повтор, порядок сканов и посылка в два места", () => {
    expect(classifySortScan(list, requests, null, "UK-ORD-1").kind).toBe("dup");
    expect(classifySortScan(list, requests, null, P1).kind).toBe("point_first");
    expect(classifySortScan(list, requests, "UK-ORD-2", "UK-LBL-3").kind).toBe("parcel_pending");
    expect(classifySortScan(list, requests, null, "UK-OUT-4").kind).toBe("no_destination");
    expect(classifySortScan(list, requests, null, "UK-OUT-9").kind).toBe("unknown");
  });

  it("закрытая отгрузка не принимает: следующая — новый номер", () => {
    const closed = [...list, box("UK-OUT-X-1", [], { sortCode: P1, place: "pallet" })];
    expect(currentSortPoint(closed, KOL)).toBe(sortPointCode(KOL, 2));
    expect(classifySortScan(closed, requests, "UK-ORD-2", P1)).toMatchObject({
      kind: "point_closed",
      next: sortPointCode(KOL, 2),
    });
    expect(classifySortScan(closed, requests, "UK-ORD-2", sortPointCode(KOL, 2)).kind).toBe(
      "placed",
    );
  });

  it("списки: места и что ещё не разложено", () => {
    expect(sortPoints(list, requests)).toMatchObject([
      { code: P1, destination: KOL, parcels: 1, places: [] },
    ]);
    expect(unsorted(list, requests).map((x) => x.box.code)).toEqual(["UK-ORD-2", "UK-LBL-3"]);
  });
});

describe("грузовые места", () => {
  it("сначала паллеты, потом коробки; ярлык места грузит всю отгрузку", () => {
    const places = placeCodes(P1, 2, 1);
    expect(places.map((p) => p.place)).toEqual(["pallet", "pallet", "box"]);
    expect(places[0].code.startsWith("UK-OUT-")).toBe(true);
    const list = [
      box("UK-ORD-1", ["r1"], { sortCode: P1 }),
      ...places.map((p) => box(p.code, [], { sortCode: P1, place: p.place })),
      box("UK-ORD-2", ["r2"]),
    ];
    expect(shipmentOfPlace(list, places[1].code).map((b) => b.code)).toEqual([
      "UK-ORD-1",
      ...places.map((p) => p.code),
    ]);
  });
});
