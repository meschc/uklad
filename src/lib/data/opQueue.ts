import { useSyncExternalStore } from "react";
import { apiRequest } from "./api";
import { readLocal, writeLocal } from "../safeStorage";

/**
 * Очередь операций стола (миграция 015, `server/api/src/cabinet/deskOps.js`).
 *
 * Отметка смены ставится в стор сразу — человек не ждёт сети, — и тут же
 * ложится сюда операцией с ключом повтора. Очередь уходит на сервер пачками,
 * переживает перезагрузку и обрыв связи: повтор того же ключа сервер не
 * задвоит. Пока в очереди что-то есть дольше `STUCK_MS`, рабочее место
 * показывает «не отправлено» — человек видит, что сервер ещё не знает о
 * его работе.
 *
 * Стол с пропуском снимок не пишет вовсе: операция, которую сервер не принял
 * или потерял, возвращает серверную копию (`resyncDesk`).
 *
 * 404 — рабочее место под входом руководителя или сервер без этого
 * маршрута: очередь выбрасывается молча, та же работа уходит записью снимка.
 * 400 — сервер не признал операции вовсе: они выбрасываются, но человек
 * узнаёт, сколько отметок не дошло. Отказ стола (403) и «снимка ещё нет»
 * (409) — не повод терять часы: очередь ждёт и повторяет, «не отправлено»
 * остаётся в шапке.
 */

export type DeskOpKind =
  | "shift_mark"
  | "shift_undo"
  | "pack_event"
  | "pack_done"
  | "pick_unit"
  | "pick_done"
  | "recv_open"
  | "recv_unit"
  | "recv_place"
  | "recv_attach"
  | "recv_close"
  | "ship_run"
  | "dispute_resolve"
  | "recv_cargo"
  | "inv_count";
const KINDS: readonly DeskOpKind[] = [
  "shift_mark",
  "shift_undo",
  "pack_event",
  "pack_done",
  "pick_unit",
  "pick_done",
  "recv_open",
  "recv_unit",
  "recv_place",
  "recv_attach",
  "recv_close",
  "ship_run",
  "dispute_resolve",
  "recv_cargo",
  "inv_count",
];
export interface DeskOpBody {
  eventId: string;
  staffId: string;
  at: number;
  type?: string;
  station?: string;
  reason?: string;
  // Упаковка (`pack_event`, `pack_done`).
  toteId?: string;
  code?: string;
  productId?: string;
  orderId?: string;
  ms?: number;
  dispute?: { id: string; kind: string; qty: number };
  outboundCode?: string;
  outboundId?: string;
  lines?: { productId: string; qty: number }[];
  requestIds?: string[];
  shortages?: { id: string; productId: string; qty: number }[];
  // Сборка (`pick_unit`, `pick_done`).
  requestId?: string;
  cell?: { floorId: string; moduleId: string; shelfIndex: number; cellIndex: number };
  partial?: boolean;
  // Приёмка (`recv_*`).
  unitId?: string;
  boxId?: string;
  palletId?: string;
  shipmentId?: string;
  lineId?: string;
  qty?: number;
  discrepancy?: "shortage" | "overage";
  // Грузовая приёмка (`recv_cargo`): сколько мест приехало и по накладной.
  pallets?: number;
  boxes?: number;
  declaredPallets?: number;
  declaredBoxes?: number;
  // Рейс (`ship_run`) и решение старшего (`dispute_resolve`).
  vehicle?: string;
  units?: string[];
  disputeId?: string;
  resolution?: string;
  note?: string;
}
export interface DeskOp {
  key: string;
  kind: DeskOpKind;
  body: DeskOpBody;
}
/** Почему сервер не положил операцию в снимок. */
type OpFlag = "nobody" | "not_present" | "time" | "bad" | "not_yours" | "late" | "backdated";

/** Места, которые завёл сервер, с номерами ярлыков (`recv_cargo`). */
interface CargoMade {
  pallets: { id: string; barcode: string }[];
  boxes: { id: string; barcode: string }[];
}

interface OpResult {
  key: string;
  status: "applied" | "flagged";
  reason?: string;
  duplicate?: boolean;
  made?: CargoMade;
}
/**
 * Ответ на операцию, которую ждут, а не ставят в очередь. `local` — сервер
 * не знает этот стол (рабочее место под входом руководителя): та же работа
 * уходит снимком.
 */
type NowOutcome = { kind: "ok"; result: OpResult } | { kind: "local" } | { kind: "fail" };
export type SendOutcome =
  { kind: "ok"; results: OpResult[] } | { kind: "drop"; lost: boolean } | { kind: "retry" };

export interface Pending {
  count: number;
  /** С какого времени очередь не пуста. */
  since: number | null;
}

export interface OpQueue {
  enqueue: (kind: DeskOpKind, body: DeskOpBody) => void;
  /**
   * Отправить одну операцию сразу и дождаться ответа — когда без ответа
   * сервера дальше идти нельзя (номера ярлыков грузовой приёмки). Повтор
   * после обрыва — с тем же ключом: сервер ответит тем же.
   */
  sendNow: (key: string, kind: DeskOpKind, body: DeskOpBody) => Promise<NowOutcome>;
  flush: () => Promise<void>;
  pending: () => Pending;
  subscribe: (fn: () => void) => () => void;
}

const OPS_KEY = "uklad-desk-ops-v1";
/** Как `MAX_OPS` на сервере. */
const BATCH = 50;
/** Больше очередь не растёт: столько отметок за смену у стола не бывает. */
const MAX_QUEUE = 2000;
const RETRY_MS = [2_000, 5_000, 15_000, 30_000];
/** Через сколько неотправленное становится заметным. */
export const STUCK_MS = 10_000;

interface Stored {
  ops: DeskOp[];
  since: number | null;
}

export interface QueueDeps {
  send: (ops: DeskOp[]) => Promise<SendOutcome>;
  read: () => string | null;
  write: (text: string) => void;
  /** Сервер пометил операции: сказать человеку один раз на пачку. */
  onFlagged: (reasons: OpFlag[], kinds: DeskOpKind[]) => void;
  /** Операции выброшены непринятыми: сказать человеку, сколько. */
  onLost: (count: number) => void;
  later: (fn: () => void, ms: number) => void;
  now: () => number;
  newKey: () => string;
}

const isOpLike = (x: unknown): x is DeskOp => {
  if (!x || typeof x !== "object") return false;
  const op = x as DeskOp;
  return (
    typeof op.key === "string" &&
    KINDS.includes(op.kind) &&
    !!op.body &&
    typeof op.body.at === "number"
  );
};

export function createOpQueue(deps: QueueDeps): OpQueue {
  const listeners = new Set<() => void>();
  let sending: Promise<void> | null = null;
  let attempt = 0;

  const load = (): Stored => {
    try {
      const raw = JSON.parse(deps.read() ?? "null") as Partial<Stored> | null;
      const ops = Array.isArray(raw?.ops) ? raw.ops.filter(isOpLike) : [];
      const since = ops.length > 0 && typeof raw?.since === "number" ? raw.since : null;
      return { ops, since: ops.length > 0 ? (since ?? deps.now()) : null };
    } catch {
      return { ops: [], since: null };
    }
  };
  const first = load();
  // Ссылка меняется только вместе с содержимым: этого ждёт useSyncExternalStore.
  let snapshot: Pending = { count: first.ops.length, since: first.since };

  const save = (s: Stored) => {
    deps.write(JSON.stringify(s));
    if (s.ops.length !== snapshot.count || s.since !== snapshot.since) {
      snapshot = { count: s.ops.length, since: s.since };
      for (const fn of listeners) fn();
    }
  };

  const flush = (): Promise<void> => {
    if (sending) return sending;
    sending = (async () => {
      for (;;) {
        const batch = load().ops.slice(0, BATCH);
        if (batch.length === 0) return;
        const out = await deps.send(batch);
        if (out.kind === "retry") {
          const ms = RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)];
          attempt += 1;
          deps.later(() => void flush(), ms);
          return;
        }
        attempt = 0;
        // Пока пачка летела, могли прийти новые: снимаем только отправленное.
        const sent = new Set(batch.map((op) => op.key));
        const s = load();
        const rest = s.ops.filter((op) => !sent.has(op.key));
        save({ ops: rest, since: rest.length > 0 ? s.since : null });
        if (out.kind === "drop" && out.lost) deps.onLost(batch.length);
        if (out.kind === "ok") {
          const flagged = out.results.filter((r) => r.status === "flagged" && !r.duplicate);
          const kindOf = new Map(batch.map((op) => [op.key, op.kind]));
          if (flagged.length > 0) {
            deps.onFlagged(
              flagged.map((r) => r.reason as OpFlag),
              flagged.flatMap((r) => kindOf.get(r.key) ?? []),
            );
          }
        }
      }
    })().finally(() => {
      sending = null;
    });
    return sending;
  };

  // Что осталось с прошлого раза, уходит само.
  if (snapshot.count > 0) deps.later(() => void flush(), 0);

  return {
    enqueue: (kind, body) => {
      const s = load();
      const ops = [...s.ops, { key: deps.newKey(), kind, body }].slice(-MAX_QUEUE);
      save({ ops, since: s.since ?? deps.now() });
      void flush();
    },
    sendNow: async (key, kind, body) => {
      const out = await deps.send([{ key, kind, body }]);
      if (out.kind === "drop") return out.lost ? { kind: "fail" } : { kind: "local" };
      const result = out.kind === "ok" ? out.results.find((r) => r.key === key) : undefined;
      return result ? { kind: "ok", result } : { kind: "fail" };
    },
    flush,
    pending: () => snapshot,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}

/** Отправка пачки. Синхронизация импортируется лениво: стор зависит от слоя данных. */
async function sendToServer(ops: DeskOp[]): Promise<SendOutcome> {
  try {
    const { sendDeskOps } = await import("../store/serverSync");
    const res = await sendDeskOps(async () => {
      const r = await apiRequest("POST", "/desk/ops", { ops });
      if (r.status !== 200) return { status: r.status, before: 0, version: 0, results: [] };
      return {
        status: 200,
        before: Number(r.body.before),
        version: Number(r.body.version),
        results: Array.isArray(r.body.results) ? (r.body.results as OpResult[]) : [],
      };
    });
    if (res.status === 200) return { kind: "ok", results: res.results };
    if (res.status === 404) return { kind: "drop", lost: false };
    // 413 — снимок компании упёрся в лимит: повтор не поможет, человек
    // узнаёт, сколько не дошло.
    if (res.status === 400 || res.status === 413) return { kind: "drop", lost: true };
    return { kind: "retry" };
  } catch {
    return { kind: "retry" };
  }
}

const randomKey = () => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};

/**
 * Сервер не положил отметку: обычно он не знает, кто за столом (бейдж не
 * дошёл или сотрудник сменился). Здесь отметка уже стоит, поэтому человеку
 * нужно сказать, что на сервере её нет.
 */
async function sayFlagged(kinds: DeskOpKind[]) {
  const { useEditor } = await import("../store");
  const packing = kinds.some((k) => k === "pack_event" || k === "pack_done");
  const picking = kinds.some((k) => k === "pick_unit" || k === "pick_done");
  const receiving = kinds.some((k) => k.startsWith("recv_"));
  const shipping = kinds.includes("ship_run");
  const deciding = kinds.includes("dispute_resolve");
  const counting = kinds.includes("inv_count");
  useEditor
    .getState()
    .showToast(
      packing
        ? "ws.opPackRejected"
        : picking
          ? "ws.opPickRejected"
          : receiving
            ? "ws.opRecvRejected"
            : shipping
              ? "ws.opShipRejected"
              : deciding
                ? "ws.opDisputeRejected"
                : counting
                  ? "ws.opCountRejected"
                  : "ws.opRejected",
    );
}

/**
 * Сервер не принял операцию: копия стола уже содержит эту работу, а на
 * сервере её нет. Снимок стол не пишет, поэтому забирает серверный сам.
 */
async function resync() {
  const { resyncDesk } = await import("../store/serverSync");
  await resyncDesk();
}

async function sayLost(n: number) {
  const { useEditor } = await import("../store");
  useEditor.getState().showToast("ws.opLost", { n });
}

export const deskOps: OpQueue = createOpQueue({
  send: sendToServer,
  read: () => readLocal(OPS_KEY),
  write: (text) => writeLocal(OPS_KEY, text),
  onFlagged: (_reasons, kinds) => {
    void sayFlagged(kinds);
    void resync();
  },
  onLost: (n) => {
    void sayLost(n);
    void resync();
  },
  later: (fn, ms) => void setTimeout(fn, ms),
  now: () => Date.now(),
  newKey: randomKey,
});

/** Неотправленное — для пометки на рабочем месте. */
export function usePendingOps(): Pending {
  return useSyncExternalStore(deskOps.subscribe, deskOps.pending, deskOps.pending);
}
