import { describe, expect, it, vi } from "vitest";
import type { EditorState } from "../../store/state";
import type { StaffEvent } from "../../types";
import type { StorePort } from "../repository";
import { createOpQueue, type DeskOp, type OpQueue, type SendOutcome } from "../opQueue";
import { createWorkstationRepository } from "../workstationRepository";
import { ok } from "../result";

/**
 * Очередь операций стола. Ошибается молча: отметка, потерянная при обрыве,
 * выглядит как прогул, а отправленная дважды — как два перерыва. Сеть,
 * хранилище и таймер подменены, порядок событий задаёт тест.
 */

function harness(replies: SendOutcome[]) {
  let stored: string | null = null;
  const sent: DeskOp[][] = [];
  const timers: Array<() => void> = [];
  const flagged = vi.fn();
  const lost = vi.fn();
  let n = 0;
  const deps = {
    send: vi.fn(async (ops: DeskOp[]): Promise<SendOutcome> => {
      sent.push(ops);
      return replies.shift() ?? { kind: "ok", results: [] };
    }),
    read: () => stored,
    write: (t: string) => void (stored = t),
    onFlagged: flagged,
    onLost: lost,
    later: (fn: () => void) => void timers.push(fn),
    now: () => 1000,
    newKey: () => `key-${String(++n).padStart(6, "0")}`,
  };
  return { deps, sent, timers, flagged, lost, make: () => createOpQueue(deps) };
}

const body = (eventId: string) => ({ eventId, staffId: "stf-ivan", type: "break_start", at: 900 });

describe("opQueue", () => {
  it("отметка уходит сразу и снимается с очереди после ответа", async () => {
    const h = harness([]);
    const q = h.make();
    q.enqueue("shift_mark", body("ev1"));
    await q.flush();
    expect(h.sent).toEqual([[{ key: "key-000001", kind: "shift_mark", body: body("ev1") }]]);
    expect(q.pending()).toEqual({ count: 0, since: null });
  });

  it("нет связи: очередь остаётся, переживает перезагрузку, уходит тем же ключом", async () => {
    const h = harness([{ kind: "retry" }]);
    const q = h.make();
    q.enqueue("shift_mark", body("ev1"));
    await q.flush();
    expect(q.pending()).toEqual({ count: 1, since: 1000 });
    expect(h.timers).toHaveLength(1);

    // Перезагрузка: новая очередь читает то же хранилище и сама шлёт.
    const again = h.make();
    expect(again.pending().count).toBe(1);
    h.timers.at(-1)!();
    await again.flush();
    expect(h.sent.map((b) => b.map((op) => op.key))).toEqual([["key-000001"], ["key-000001"]]);
    expect(again.pending().count).toBe(0);
  });

  it("сервер не признал пачку (400): выбрасывается, человек узнаёт сколько", async () => {
    const h = harness([{ kind: "drop", lost: true }]);
    const q = h.make();
    q.enqueue("shift_mark", body("ev1"));
    await q.flush();
    expect(h.lost).toHaveBeenCalledWith(1);
    expect(q.pending().count).toBe(0);
  });

  it("рабочее место без стола (404): выбрасывается молча", async () => {
    const h = harness([{ kind: "drop", lost: false }]);
    const q = h.make();
    q.enqueue("shift_undo", body("ev1"));
    await q.flush();
    expect(q.pending().count).toBe(0);
    expect(h.timers).toHaveLength(0);
    expect(h.lost).not.toHaveBeenCalled();
  });

  it("пометка сервера говорится человеку, повтор уже помеченной — нет", async () => {
    const h = harness([
      {
        kind: "ok",
        results: [
          { key: "key-000001", status: "flagged", reason: "nobody" },
          { key: "key-000002", status: "flagged", reason: "late", duplicate: true },
        ],
      },
    ]);
    const q = h.make();
    q.enqueue("shift_mark", body("ev1"));
    await q.flush();
    expect(h.flagged).toHaveBeenCalledWith(["nobody"], ["shift_mark"]);
  });

  it("пришедшее во время отправки не теряется", async () => {
    const h = harness([]);
    const q = h.make();
    let release!: () => void;
    h.deps.send.mockImplementationOnce(async (ops) => {
      h.sent.push(ops);
      await new Promise<void>((r) => (release = r));
      return { kind: "ok", results: [] };
    });
    q.enqueue("shift_mark", body("ev1"));
    q.enqueue("shift_mark", body("ev2"));
    release();
    await q.flush();
    expect(h.sent.map((b) => b.map((op) => op.body.eventId))).toEqual([["ev1"], ["ev2"]]);
    expect(q.pending().count).toBe(0);
  });

  it("битое хранилище — пустая очередь, а не падение", () => {
    const h = harness([]);
    h.deps.write("{не json");
    expect(h.make().pending()).toEqual({ count: 0, since: null });
  });
});

function port(server: boolean): StorePort {
  const state = {
    session: { source: server ? "server" : "local" },
    staffEvents: [] as StaffEvent[],
    markShift: vi.fn(() => {
      state.staffEvents = [
        ...state.staffEvents,
        { id: "sev_1", staffId: "stf-ivan", type: "break_start", at: 5, station: "pack" },
      ];
      return true;
    }),
    undoShiftMark: vi.fn(() => {
      state.staffEvents = [];
      return true;
    }),
  };
  return { get: () => state as unknown as EditorState, set: () => {} };
}

function fakeQueue(): OpQueue {
  return {
    enqueue: vi.fn(),
    flush: vi.fn(async () => {}),
    pending: () => ({ count: 0, since: null }),
    subscribe: () => () => {},
  };
}

describe("workstationRepository: отметки смены операциями", () => {
  const badges = {
    check: vi.fn(async () => ok(null)),
    issue: vi.fn(async () => ok("")),
    revoke: vi.fn(async () => ok(undefined)),
  };
  const desks = {
    open: vi.fn(async () => ok(undefined)),
    revoke: vi.fn(async () => ok(undefined)),
    unbind: vi.fn(async () => ok(null)),
    leave: vi.fn(async () => ok(undefined)),
  };

  it("на сервере отметка и её отмена встают в очередь с id события", async () => {
    const q = fakeQueue();
    const repo = createWorkstationRepository(port(true), badges, desks, q);
    await repo.mark("break_start");
    await repo.undoMark();
    expect(q.enqueue).toHaveBeenNthCalledWith(1, "shift_mark", {
      eventId: "sev_1",
      staffId: "stf-ivan",
      type: "break_start",
      at: 5,
      station: "pack",
    });
    expect(q.enqueue).toHaveBeenNthCalledWith(
      2,
      "shift_undo",
      expect.objectContaining({ eventId: "sev_1", staffId: "stf-ivan" }),
    );
  });

  it("закрытие тары на сервере уходит фактами упаковки", async () => {
    const q = fakeQueue();
    const p = port(true);
    const facts = {
      eventId: "sev_done",
      staffId: "stf-ivan",
      at: 7,
      toteId: "t1",
      outboundCode: "UK-OUT-1",
      outboundId: "out1",
      lines: [{ productId: "p1", qty: 2 }],
      requestIds: ["r1"],
      shortages: [],
    };
    (p.get() as unknown as { packFinish: () => unknown }).packFinish = () => facts;
    const repo = createWorkstationRepository(p, badges, desks, q);
    await repo.packFinish();
    expect(q.enqueue).toHaveBeenCalledWith("pack_done", facts);
  });

  it("в демо очереди нет", async () => {
    const q = fakeQueue();
    const repo = createWorkstationRepository(port(false), badges, desks, q);
    await repo.mark("break_start");
    expect(q.enqueue).not.toHaveBeenCalled();
  });
});
