import { describe, expect, it } from "vitest";
import { fail, ok } from "../../data/result";
import { GS, isValidGtin, maskMarkingCode, parseMarkingCode } from "../../markingCode";
import { getConnector, indexRefs, linkRef, resolveProduct } from "..";
import { mapCisesInfo, signInHonestSign } from "../honestSign";
import { mapOzonPostings } from "../ozon";
import type { ConnectorRequest, ConnectorTransport } from "../transport";
import { createServerTransport, offlineTransport } from "../transport";
import { mapWbOrders } from "../wildberries";
import { mapYmOrders } from "../yandexMarket";
import { mapAvitoOrders } from "../avito";
import { mapMoyskladOrders } from "../moysklad";

// GTIN с верной контрольной цифрой (контрольная цифра 8).
const GTIN = "04600000000008";

/** Транспорт-стенд: запоминает запросы, отвечает заданным. */
function stub(reply: (r: ConnectorRequest) => unknown): ConnectorTransport & {
  calls: ConnectorRequest[];
} {
  const calls: ConnectorRequest[] = [];
  return {
    calls,
    async request(r) {
      calls.push(r);
      return ok(reply(r));
    },
  };
}

describe("parseMarkingCode", () => {
  it("разбирает код с настоящим GS", () => {
    const c = parseMarkingCode(`01${GTIN}21ABCDEFGHIJKLM${GS}91EE10${GS}92dGVzdA==`)!;
    expect(c.gtin).toBe(GTIN);
    expect(c.serial).toBe("ABCDEFGHIJKLM");
    expect(c.verifyKey).toBe("EE10");
    expect(c.crypto).toBe("dGVzdA==");
    expect(c.cis).toBe(`01${GTIN}21ABCDEFGHIJKLM`);
    expect(c.gtinValid).toBe(true);
  });

  it("терпит потерянный GS: серийник режется по длине группы", () => {
    const c = parseMarkingCode(`01${GTIN}21ABCDEFGHIJKLM91EE1092dGVzdA==`)!;
    expect(c.serial).toBe("ABCDEFGHIJKLM");
    expect(c.verifyKey).toBe("EE10");
  });

  it("понимает текстовую запись <GS> и короткий хвост 93", () => {
    const c = parseMarkingCode(`01${GTIN}21abc123<GS>93Ab1C`)!;
    expect(c.serial).toBe("abc123");
    expect(c.crypto).toBe("Ab1C");
    expect(c.full).toBe(`01${GTIN}21abc123${GS}93Ab1C`);
  });

  it("не принимает обычный штрихкод и не показывает криптохвост", () => {
    expect(parseMarkingCode("4600000000009")).toBeUndefined();
    const c = parseMarkingCode(`01${GTIN}21abc123${GS}93Ab1C`)!;
    expect(maskMarkingCode(c)).not.toContain("Ab1C");
  });

  it("проверяет контрольную цифру GTIN", () => {
    expect(isValidGtin(GTIN)).toBe(true);
    expect(isValidGtin("04600000000002")).toBe(false);
  });
});

describe("единый номер Уклада", () => {
  it("ищет сначала номер своей площадки, потом общий", () => {
    let refs = linkRef([], {
      system: "wildberries",
      kind: "sku",
      value: "777",
      productId: "p1",
    }).refs;
    refs = linkRef(refs, { system: null, kind: "sku", value: "777", productId: "p2" }).refs;
    const idx = indexRefs(refs);
    expect(resolveProduct(idx, "wildberries", "sku", "777")).toBe("p1");
    expect(resolveProduct(idx, "ozon", "sku", "777")).toBe("p2");
  });

  it("не перезаписывает чужую связку молча", () => {
    const refs = linkRef([], { system: "ozon", kind: "sku", value: "1", productId: "p1" }).refs;
    const res = linkRef(refs, { system: "ozon", kind: "sku", value: "1", productId: "p2" });
    expect(res.conflictWith).toBe("p1");
    expect(res.refs).toHaveLength(1);
  });
});

describe("разбор ответов площадок", () => {
  it("WB: заказ — одна строка, sgtin значит нужны коды", () => {
    const [o] = mapWbOrders({
      orders: [
        {
          id: 5,
          createdAt: "2026-10-21T10:00:00Z",
          nmId: 9,
          article: "A-1",
          skus: ["460"],
          requiredMeta: ["sgtin"],
        },
      ],
    });
    expect(o.externalId).toBe("5");
    expect(o.lines[0]).toMatchObject({
      externalSku: "9",
      vendorCode: "A-1",
      qty: 1,
      requiresMarks: true,
    });
    expect(mapWbOrders(null)).toEqual([]);
  });

  it("Ozon: отправление с несколькими товарами", () => {
    const [o] = mapOzonPostings({
      result: {
        postings: [
          {
            posting_number: "123-1",
            in_process_at: "x",
            shipment_date: "y",
            products: [
              { sku: 1, offer_id: "A", quantity: 2 },
              { sku: 2, quantity: 1 },
            ],
          },
        ],
      },
    });
    expect(o.shipBy).toBe("y");
    expect(o.lines).toHaveLength(2);
    expect(mapOzonPostings({})).toEqual([]);
  });

  it("ГИС МТ: статус и владелец, незнакомый статус — unknown", () => {
    const res = mapCisesInfo([
      { cisInfo: { cis: "c1", status: "INTRODUCED", ownerInn: "7700000000" } },
      { cisInfo: { cis: "c2", status: "NEW_THING" } },
      { broken: true },
    ]);
    expect(res).toEqual([
      { cis: "c1", status: "introduced", gtin: undefined, ownerInn: "7700000000" },
      { cis: "c2", status: "unknown", gtin: undefined, ownerInn: undefined },
    ]);
  });
});

describe("адаптеры и транспорт", () => {
  it("до сервера отвечают «заработает после сервера»", async () => {
    const wb = getConnector("wildberries", "acc", offlineTransport)!;
    expect(await wb.fetchOrders!()).toEqual(fail("integr.error.noServer"));
  });

  it("в ГИС МТ уходит код без криптохвоста", async () => {
    const t = stub(() => []);
    await getConnector("honest-sign", "acc", t)!.verifyMarks!([
      `01${GTIN}21abc123${GS}93Ab1C`,
      "мусор",
    ]);
    expect(t.calls[0].body).toEqual([`01${GTIN}21abc123`]);
  });

  it("вход в ГИС МТ: подписывается строка сервера, ключ не уходит", async () => {
    const t = stub((r) =>
      r.path.endsWith("/auth/key") ? { uuid: "u", data: "RAND" } : { token: "t" },
    );
    const signed: string[] = [];
    const res = await signInHonestSign(t, "acc", {
      async sign(d) {
        signed.push(d);
        return ok("SIG");
      },
    });
    expect(res.ok).toBe(true);
    expect(signed).toEqual(["RAND"]);
    expect(t.calls[1].body).toEqual({ uuid: "u", data: "SIG" });
  });

  it("серверный транспорт переводит 401 и 429 в ключи словаря", async () => {
    const mk = (status: number) =>
      createServerTransport("", (async () => new Response("", { status })) as typeof fetch);
    const req: ConnectorRequest = { system: "ozon", account: "a", method: "POST", path: "/x" };
    expect(await mk(401).request(req)).toEqual(fail("integr.error.rejected"));
    expect(await mk(429).request(req)).toEqual(fail("integr.error.rateLimit"));
  });
});

describe("адаптеры Маркета, Авито, Мегамаркета и МоегоСклада", () => {
  it("Маркет: заказы, даты и признак маркировки", () => {
    const [o] = mapYmOrders({
      orders: [
        {
          id: 42,
          creationDate: "23-10-2026 10:15:00",
          items: [{ offerId: "SKU-1", count: 2, requiredInstanceTypes: ["CIS"] }],
          delivery: { shipments: [{ shipmentDate: "25-10-2026" }] },
        },
      ],
    });
    expect(o.externalId).toBe("42");
    expect(o.createdAt).toBe("2026-10-23T10:15:00+03:00");
    expect(o.shipBy).toBe("2026-10-25T00:00:00+03:00");
    expect(o.lines[0]).toMatchObject({ externalSku: "SKU-1", qty: 2, requiresMarks: true });
  });

  it("Маркет: остатки уходят по SKU с кампанией из сервера", async () => {
    const t = stub(() => ({}));
    await getConnector("yandex-market", "acc", t)!.pushStocks!("", [
      { externalSku: "SKU-1", qty: -3 },
    ]);
    expect(t.calls[0].path).toBe("/v2/campaigns/{campaignId}/offers/stocks");
    expect(t.calls[0].body).toMatchObject({ skus: [{ sku: "SKU-1", items: [{ count: 0 }] }] });
  });

  it("Авито: заказ с маркировкой и остатки пачками по 200", async () => {
    const [o] = mapAvitoOrders({
      orders: [
        {
          id: "5",
          createdAt: "2026-10-23T10:00:00Z",
          items: [{ avitoId: "777", id: "A-1", count: 1 }],
          availableActions: [{ name: "setMarkings" }],
        },
      ],
    });
    expect(o.lines[0]).toMatchObject({
      externalSku: "777",
      vendorCode: "A-1",
      requiresMarks: true,
    });
    const t = stub(() => ({}));
    const many = Array.from({ length: 201 }, (_, i) => ({ externalSku: String(i + 1), qty: 1 }));
    await getConnector("avito", "acc", t)!.pushStocks!("", many);
    expect(t.calls).toHaveLength(2);
  });

  it("Мегамаркет: остатки по offerId", async () => {
    const t = stub(() => ({}));
    await getConnector("megamarket", "acc", t)!.pushStocks!("", [{ externalSku: "O-1", qty: 4 }]);
    expect(t.calls[0].body).toMatchObject({ data: { stocks: [{ offerId: "O-1", quantity: 4 }] } });
  });

  it("МойСклад: заказ покупателя → задание", () => {
    const [o] = mapMoyskladOrders({
      rows: [
        {
          name: "00012",
          moment: "2026-10-23 09:00:00.000",
          positions: { rows: [{ quantity: 3, assortment: { id: "u1", article: "ART" } }] },
        },
      ],
    });
    expect(o).toMatchObject({ externalId: "00012", createdAt: "2026-10-23T09:00:00+03:00" });
    expect(o.lines[0]).toMatchObject({ externalSku: "u1", vendorCode: "ART", qty: 3 });
  });
});
