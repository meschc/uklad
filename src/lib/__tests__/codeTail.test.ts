import { describe, expect, it } from "vitest";
import { splitCode, splitCodes } from "../codeTail";

describe("splitCode", () => {
  it("EAN и номер — последние 4 знака", () => {
    expect(splitCode("4601234567890")).toEqual({ head: "460123456", tail: "7890", rest: "" });
    expect(splitCode("123")).toEqual({ head: "", tail: "123", rest: "" });
  });

  it("наш ярлык — хвост номера после последнего дефиса", () => {
    expect(splitCode("UK-BOX-28")).toEqual({ head: "UK-BOX-", tail: "28", rest: "" });
    expect(splitCode("UK-BOX-000123")).toEqual({ head: "UK-BOX-00", tail: "0123", rest: "" });
    expect(splitCode("UK-OUT-7KQ2ZD")).toEqual({ head: "UK-OUT-7K", tail: "Q2ZD", rest: "" });
  });

  it("DataMatrix — хвост серийного номера, криптохвост не выделен", () => {
    expect(splitCode("010460123456789021XYZ9876 93ab")).toEqual({
      head: "010460123456789021XYZ",
      tail: "9876",
      rest: " 93ab",
    });
  });
});

describe("splitCodes", () => {
  it("выделяет коды в сообщении и не трогает слова и артикулы", () => {
    expect(splitCodes("Тара UK-BOX-28 закреплена, TS-001-BLK × 2")).toEqual([
      "Тара ",
      { code: "UK-BOX-28" },
      " закреплена, TS-001-BLK × 2",
    ]);
    expect(splitCodes("Посылка 87654321-0001-1 на месте")).toEqual([
      "Посылка ",
      { code: "87654321-0001-1" },
      " на месте",
    ]);
    expect(splitCodes("Готово: 3 из 5")).toEqual(["Готово: 3 из 5"]);
  });
});
