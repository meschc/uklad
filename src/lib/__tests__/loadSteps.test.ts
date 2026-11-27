import { describe, expect, it } from "vitest";
import { addLoaded, EMPTY_LOADED, undoLoaded } from "../loadSteps";

/** Отмена своего скана на погрузке: снимается последний скан целиком, не больше. */
describe("loadSteps", () => {
  it("последнее место отгрузки досылает посылки — отмена снимает их вместе с ним", () => {
    let l = addLoaded(EMPTY_LOADED, ["UK-OUT-1"]);
    l = addLoaded(l, ["UK-OUT-P2", "UK-ORD-7", "UK-ORD-8"]);
    expect(l.units).toEqual(["UK-OUT-1", "UK-OUT-P2", "UK-ORD-7", "UK-ORD-8"]);
    l = undoLoaded(l);
    expect(l.units).toEqual(["UK-OUT-1"]);
    l = undoLoaded(undoLoaded(l));
    expect(l).toEqual(EMPTY_LOADED);
  });
  it("уже погруженное второй раз не пишется и отменой первого шага не теряется", () => {
    let l = addLoaded(EMPTY_LOADED, ["A", "B"]);
    l = addLoaded(l, ["B", "C"]);
    expect(l.steps).toEqual([["A", "B"], ["C"]]);
    expect(undoLoaded(l).units).toEqual(["A", "B"]);
    expect(addLoaded(l, ["A"])).toBe(l);
  });
});
