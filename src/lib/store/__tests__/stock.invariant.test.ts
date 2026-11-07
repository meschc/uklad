import { describe, expect, it } from "vitest";
import { create, type StateCreator } from "zustand";
import { createDisputesSlice } from "../disputes.slice";
import { createFulfillmentSlice } from "../fulfillment.slice";
import { createRequestsSlice } from "../requests.slice";
import { createWorkstationSlice } from "../workstation.slice";
import type { EditorState } from "../state";
import { badgeCode } from "../../workstation";
import { pendingLabel } from "../../packing";
import { makeProduct } from "../../__tests__/fixtures";
import type { CellAddress } from "../../types";
import { broken, onHand } from "./ledger";

/**
 * Сохранность товара на всём пути склада (просьба Кирилла 7.11.2026: «чтобы
 * товар просто так не потерялся, не раздублировался и не уехал не туда»).
 *
 * После КАЖДОГО шага сверяется книга остатков (`ledger.ts`): пришло =
 * на складе + ушло. Шаги идут так, как их делают люди: приёмка, место,
 * сборка в тару, упаковка с браком и недостачей, решение старшего, погрузка.
 */

type Slice = StateCreator<EditorState, [], [], object>;
const slices = [
  createFulfillmentSlice,
  createRequestsSlice,
  createWorkstationSlice,
  createDisputesSlice,
] as unknown as Slice[];

const A = makeProduct({ id: "p-a", partnerId: "seller", barcode: "4600000000017" });
const B = makeProduct({ id: "p-b", partnerId: "seller", barcode: "4600000000024" });
const C1: CellAddress = { floorId: "f1", moduleId: "m1", shelfIndex: 0, cellIndex: 0 };
const C2: CellAddress = { floorId: "f1", moduleId: "m1", shelfIndex: 0, cellIndex: 1 };

function warehouse() {
  const store = create<EditorState>()(
    (...a) =>
      ({
        ...Object.assign({}, ...slices.map((f) => f(...a))),
        products: [A, B],
        placements: {},
        showToast: () => {},
        warehouse: {
          staff: [
            { id: "s1", name: "Упаковщик", role: "Упаковщик" },
            { id: "s2", name: "Старший", role: "Старший смены" },
          ],
        },
      }) as unknown as EditorState,
  );
  const s = () => store.getState();
  /** Книга сходится — иначе тест называет товар и все три суммы. */
  const check = (step: string) => expect(broken(s()), step).toEqual([]);
  return { s, check };
}

/** Принять и поставить на место: короб с товаром в ячейке. */
function stock(w: ReturnType<typeof warehouse>, productId: string, qty: number, at: CellAddress) {
  const box = w.s().createBox();
  w.s().receiveProduct({ productId, qty, boxId: box.id, staffId: "s1" });
  w.s().placeBox(box.id, at);
  return box;
}

describe("товар не теряется и не двоится на пути склада", () => {
  it("приёмка → место → сборка в тару → упаковка с браком → старший → рейс", () => {
    const w = warehouse();
    const { s, check } = w;
    stock(w, "p-a", 10, C1);
    check("приёмка A");
    stock(w, "p-b", 3, C2);
    check("приёмка B");

    // Заказ в Тулу: 3 A и 2 B — одна тара.
    const r1 = s().createRequest({ productId: "p-a", qty: 3, note: "Тула" });
    const r2 = s().createRequest({ productId: "p-b", qty: 2, note: "Тула" });
    const tote = s().createBox();
    for (let i = 0; i < 3; i++) s().recordPick(r1, "p-a", C1, tote.id);
    for (let i = 0; i < 2; i++) s().recordPick(r2, "p-b", C2, tote.id);
    s().completeRequest(r1);
    s().completeRequest(r2);
    check("сборка в тару");
    expect(onHand(s()).get("p-a")).toBe(10);

    // Заказ в Казань: 2 A, вторая штука — брак.
    const r3 = s().createRequest({ productId: "p-a", qty: 2, note: "Казань" });
    const tote2 = s().createBox();
    for (let i = 0; i < 2; i++) s().recordPick(r3, "p-a", C1, tote2.id);
    s().completeRequest(r3);
    check("сборка второй тары");

    s().badgeLogin(badgeCode("s1"), "pack");
    expect(s().packStart(tote.barcode, "UK-OUT-1")).toBeNull();
    const packOne = (code: string) => {
      expect(s().packScanItem(code).kind).toBe("ok");
      expect(s().packScanLabel(s().packSession!.units.at(-1)!.labelCode)).toBe(true);
      // Последняя штука заказа печатает этикетку заказа — её тоже сканируют.
      const order = pendingLabel(s().packSession!);
      if (order) expect(s().packScanLabel(order)).toBe(true);
      check(`упаковка ${code}`);
    };
    for (let i = 0; i < 3; i++) packOne(A.barcode!);
    for (let i = 0; i < 2; i++) packOne(B.barcode!);
    s().packFinish();
    check("тара закрыта");
    expect(s().outboundBoxes[0].lines).toEqual([
      { productId: "p-a", qty: 3 },
      { productId: "p-b", qty: 2 },
    ]);

    expect(s().packStart(tote2.barcode, "UK-OUT-2")).toBeNull();
    packOne(A.barcode!);
    expect(s().packScanItem(A.barcode!).kind).toBe("ok");
    s().packRejectPending();
    check("брак отложен");
    s().packFinish();
    check("тара с браком закрыта");
    // Брак лежит в таре на учёте, пока старший не решит.
    expect(s().boxes.find((b) => b.id === tote2.id)!.lines).toEqual([{ productId: "p-a", qty: 1 }]);
    const defect = s().disputes.find((d) => d.kind === "not_packable")!;
    // Списывает не тот, кто нашёл.
    expect(s().resolveDispute(defect.id, "written_off", "s1", "мятая упаковка")).toBe(false);
    expect(s().resolveDispute(defect.id, "written_off", "s2", "мятая упаковка")).toBe(true);
    check("брак списан старшим");
    expect(s().boxes.find((b) => b.id === tote2.id)!.lines).toEqual([]);

    // Погрузка: короб Тулы уехал, короб Казани ещё у ворот.
    expect(s().shipRequests([r1, r2], { vehicle: "А123ВС", units: ["UK-OUT-1"] })).not.toBeNull();
    check("рейс");
    expect(onHand(s()).get("p-a")).toBe(10 - 3 - 1);
  });

  it("сборка без тары: снятое едет с заявкой и уходит рейсом", () => {
    const w = warehouse();
    const { s, check } = w;
    stock(w, "p-a", 4, C1);
    const r = s().createRequest({ productId: "p-a", qty: 2, note: "Тула" });
    s().recordPick(r, "p-a", C1);
    s().recordPick(r, "p-a", C1);
    check("собрано");
    // Лишний скан на собранной заявке не снимает с полки ещё одну штуку.
    expect(s().recordPick(r, "p-a", C1)).toBe(2);
    check("лишний скан");
    s().completeRequest(r);
    s().shipRequests([r], { vehicle: "А123ВС" });
    check("уехало");
    expect(onHand(s()).get("p-a")).toBe(2);
  });

  it("кроссдок: принятое под заявку не лежит в таре второй раз", () => {
    const w = warehouse();
    const { s, check } = w;
    const r = s().createRequest({ productId: "p-a", qty: 2, note: "Тула" });
    const box = s().createBox();
    s().receiveProduct({ productId: "p-a", qty: 3, boxId: box.id, staffId: "s1" });
    expect(s().applyCrossDock("p-a", 3, undefined, box.id)).toBe(2);
    check("кроссдок");
    // Не разошедшееся по заявкам осталось в таре и поедет на место.
    expect(s().boxes.find((b) => b.id === box.id)!.lines).toEqual([{ productId: "p-a", qty: 1 }]);
    s().shipRequests([r], { vehicle: "А123ВС" });
    check("кроссдок уехал");
    expect(onHand(s()).get("p-a")).toBe(1);
  });

  it("старший списал брак, пока тара на столе: при закрытии он не возвращается", () => {
    const w = warehouse();
    const { s, check } = w;
    stock(w, "p-a", 2, C1);
    const r = s().createRequest({ productId: "p-a", qty: 2, note: "Тула" });
    const tote = s().createBox();
    s().recordPick(r, "p-a", C1, tote.id);
    s().recordPick(r, "p-a", C1, tote.id);
    s().completeRequest(r);
    s().badgeLogin(badgeCode("s1"), "pack");
    s().packStart(tote.barcode, "UK-OUT-1");
    expect(s().packScanItem(A.barcode!).kind).toBe("ok");
    s().packScanLabel(pendingLabel(s().packSession!)!);
    expect(s().packScanItem(A.barcode!).kind).toBe("ok");
    s().packRejectPending();
    const d = s().disputes.find((x) => x.kind === "not_packable")!;
    expect(s().resolveDispute(d.id, "written_off", "s2", "разбит")).toBe(true);
    check("списано, тара ещё на столе");
    s().packFinish();
    check("тара закрыта");
    // Одна в коробе, одна списана — в таре ничего, брак не вернулся.
    expect(s().boxes.find((b) => b.id === tote.id)!.lines).toEqual([]);
    expect(s().outboundBoxes[0].lines).toEqual([{ productId: "p-a", qty: 1 }]);
  });

  it("начатая заявка не докладывается в другую тару", () => {
    const w = warehouse();
    const { s, check } = w;
    stock(w, "p-a", 3, C1);
    const r = s().createRequest({ productId: "p-a", qty: 2, note: "Тула" });
    const [t1, t2] = [s().createBox(), s().createBox()];
    expect(s().recordPick(r, "p-a", C1, t1.id)).toBe(1);
    expect(s().recordPick(r, "p-a", C1, t2.id)).toBe(1);
    expect(s().recordPick(r, "p-a", C1)).toBe(1);
    check("чужая тара и без тары — отказ");
    expect(onHand(s()).get("p-a")).toBe(3);
  });

  it("списать можно только то, что лежит в таре", () => {
    const w = warehouse();
    const { s, check } = w;
    const box = s().createBox();
    s().receiveProduct({ productId: "p-a", qty: 2, boxId: box.id, staffId: "s1" });
    const id = s().raiseDispute({
      kind: "shortage",
      boxId: box.id,
      toteCode: box.barcode,
      productId: "p-a",
      qty: 5,
      raisedBy: "s1",
    });
    expect(s().resolveDispute(id, "written_off", "s2", "не нашли")).toBe(false);
    check("лишнее не списано");
    expect(s().boxes[0].lines).toEqual([{ productId: "p-a", qty: 2 }]);
  });

  it("случайная смена склада: шаги в любом порядке, книга сходится всегда", () => {
    let shipped = 0;
    let writtenOff = 0;
    for (const start of [7, 11, 23, 42, 99]) {
      // Свой генератор с затравкой: падение повторяется один в один.
      let seed = start;
      const rnd = (n: number) => {
        seed = (seed * 1103515245 + 12345) % 2 ** 31;
        // Младшие биты такого генератора ходят по кругу — берём старшие.
        return Math.floor((seed / 2 ** 31) * n);
      };
      const w = warehouse();
      const { s, check } = w;
      stock(w, "p-a", 20, C1);
      stock(w, "p-b", 10, C2);
      s().badgeLogin(badgeCode("s1"), "pack");
      const totes = [s().createBox(), s().createBox()];
      const targets = ["Тула", "Казань"];
      const packScan = () => {
        const ps = s().packSession;
        if (!ps) return "тары нет";
        const label = pendingLabel(ps);
        if (label) {
          s().packScanLabel(label);
          return "скан этикетки";
        }
        // Чаще товар из тары, иногда чужой код.
        const code = [A.barcode!, B.barcode!, "мусор"][rnd(10) < 9 ? rnd(2) : 2];
        s().packScanItem(code);
        return `скан ${code}`;
      };
      const steps: (() => string)[] = [
        () => {
          const p = rnd(2) ? "p-a" : "p-b";
          s().createRequest({ productId: p, qty: 1 + rnd(3), note: targets[rnd(2)] });
          return "заявка";
        },
        () => {
          const open = s().requests.filter((r) => r.status === "new" || r.status === "in_progress");
          const r = open[rnd(open.length)];
          if (!r) return "нечего собирать";
          const tote = rnd(4) ? (r.toteId ?? totes[rnd(2)].id) : undefined;
          s().startPicking(r.id);
          s().recordPick(r.id, r.productId, r.productId === "p-a" ? C1 : C2, tote);
          return `сборка ${r.productId} ${tote ? "в тару" : "без тары"}`;
        },
        () => {
          const r = s().requests.find((x) => x.status === "in_progress" && x.pickedQty);
          if (r) s().completeRequest(r.id, (r.pickedQty ?? 0) < r.qty);
          return "собрана";
        },
        () => {
          if (!s().packSession) s().packStart(totes[rnd(2)].barcode, `UK-OUT-${rnd(3)}`);
          return "тара открыта";
        },
        packScan,
        packScan,
        packScan,
        packScan,
        () => {
          if (rnd(3) === 0) s().packRejectPending();
          return "брак";
        },
        () => {
          if (rnd(3) === 0) s().packFinish();
          return "тара закрыта";
        },
        () => {
          const d = s().disputes.find((x) => !x.resolution);
          if (d) s().resolveDispute(d.id, rnd(3) ? "returned" : "written_off", "s2", "решил");
          return "решение старшего";
        },
        () => {
          const done = s().requests.filter((r) => r.status === "done");
          const units = (s().outboundBoxes ?? []).filter((b) => !b.shipmentId).map((b) => b.code);
          if (done.length > 0)
            s().shipRequests(
              done.map((r) => r.id),
              { vehicle: "А1", units },
            );
          return "рейс";
        },
      ];
      for (let i = 0; i < 400; i++) {
        const what = steps[rnd(steps.length)]();
        check(`затравка ${start}, шаг ${i}: ${what}`);
      }
      shipped += s().outboundBoxes.filter((b) => b.shipmentId).length;
      writtenOff += s().disputes.filter((d) => d.resolution === "written_off").length;
    }
    // Прогоны действительно дошли до упаковки, списаний и рейсов.
    expect(shipped).toBeGreaterThan(0);
    expect(writtenOff).toBeGreaterThan(0);
  });
});
