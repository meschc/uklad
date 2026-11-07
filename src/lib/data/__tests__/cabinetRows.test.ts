import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { diffCabinet, splitCabinet, stableJson } from "../cabinetRows";

/**
 * Правка «только изменённое» считается в браузере, а применяется на сервере
 * к строкам, которые разложил сервер. Если раскладки разойдутся хоть местом
 * в списке, порядок заявок на сервере перепутается молча — поэтому здесь
 * браузерная раскладка сверяется с серверной на одном кабинете.
 */
const require = createRequire(import.meta.url);
const server = require("../../../../server/api/src/cabinet/records.js") as {
  splitRecords: (d: object) => {
    doc: object;
    items: { w: string; d: string; ref: string; pos: number; data: object }[];
    slots: { w: string; d: string }[];
  };
  assembleRecords: (doc: object, rows: { w: string; d: string; data: object }[]) => object;
};

const cabinet = () => ({
  warehouse: { id: "wh_1", name: "Мезонин" },
  boxSeq: 7,
  products: [{ id: "p1", sku: "A", name: "Кружка" }],
  requests: [
    { id: "r2", qty: 1 },
    { id: "r1", qty: 2 },
  ],
  receivingEvents: [{ id: "e1" }, { id: "e2" }],
  boxes: [],
  staffEvents: [{ id: "s1", type: "shift_start" }],
  tasks: [{ title: "без id" }],
  warehouseData: {
    wh_2: { requests: [{ id: "r1", qty: 9 }] },
    wh_1: { requests: [{ id: "r1", qty: 5 }] },
  },
});

/** Правка, применённая к строкам так, как это делает сервер. */
function applyLikeServer(
  rows: Map<string, { w: string; d: string; ref: string; pos: number; data: object }>,
  changes: ReturnType<typeof diffCabinet>,
) {
  const key = (r: { w: string; d: string; ref: string }) => `${r.w}|${r.d}|${r.ref}`;
  for (const r of changes.upsert) rows.set(key(r), r);
  for (const r of changes.remove) rows.delete(key(r));
  const sorted = [...rows.values()].sort(
    (a, b) => (a.w + a.d).localeCompare(b.w + b.d) || a.pos - b.pos,
  );
  return server.assembleRecords(changes.doc, sorted);
}

describe("cabinetRows", () => {
  it("раскладывает кабинет так же, как сервер", () => {
    const data = cabinet();
    const mine = splitCabinet(data);
    const theirs = server.splitRecords({ ...data, products: undefined });
    const { products: _p, ...doc } = theirs.doc as Record<string, unknown>;
    expect(mine.doc).toEqual(doc);
    expect([...mine.rows.values()].map(({ w, d, ref, pos }) => ({ w, d, ref, pos }))).toEqual(
      theirs.items.map(({ w, d, ref, pos }) => ({ w, d, ref, pos })),
    );
    expect([...mine.slots.values()]).toEqual(theirs.slots);
  });

  it("шлёт только поменявшееся, а сервер собирает из него тот же кабинет", () => {
    const before = cabinet();
    const base = splitCabinet(before);
    const after = {
      ...before,
      requests: [{ id: "r3", qty: 3 }, { id: "r2", qty: 1 }, before.requests[1]],
      receivingEvents: [before.receivingEvents[0]],
      boxSeq: 8,
    };
    const changes = diffCabinet(base, splitCabinet(after), after.products);
    expect(changes.upsert.map((r) => `${r.d}/${r.ref}`)).toEqual(["requests/r3"]);
    expect(changes.remove.map((r) => `${r.d}/${r.ref}`)).toEqual(["receivingEvents/e2"]);
    expect(changes.products).toBeUndefined();
    expect(changes.slots.map((s) => s.d).sort()).toEqual(["receivingEvents", "requests"]);
    const rows = new Map(
      server.splitRecords(before).items.map((r) => [`${r.w}|${r.d}|${r.ref}`, r] as const),
    );
    const { products: _p, ...rest } = after;
    expect(applyLikeServer(rows, changes)).toEqual(rest);
  });

  it("порядок ключей из базы не делает запись изменённой", () => {
    const base = splitCabinet({ warehouse: { id: "w" }, requests: [{ qty: 1, id: "a" }] });
    const next = splitCabinet({ warehouse: { id: "w" }, requests: [{ id: "a", qty: 1 }] });
    expect(diffCabinet(base, next, undefined).upsert).toEqual([]);
    expect(stableJson({ b: 1, a: [{ d: 2, c: undefined }] })).toBe('{"a":[{"d":2}],"b":1}');
  });

  it("новый список строками попадает в правку, даже пустой; товары — только изменённые", () => {
    const base = splitCabinet({ warehouse: { id: "w" }, products: [] });
    const now = { warehouse: { id: "w" }, boxes: [], products: [{ id: "p" }] };
    const changes = diffCabinet(base, splitCabinet(now), now.products);
    expect(changes.slots).toEqual([{ w: "w", d: "boxes" }]);
    expect(changes.products).toEqual([{ id: "p" }]);
    expect(changes.doc).not.toHaveProperty("products");
  });
});
