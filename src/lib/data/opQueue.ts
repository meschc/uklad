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
 * Что повтор не исправит (400, 404 — сервер без этого маршрута или рабочее
 * место под входом руководителя, 409 — снимка ещё нет), выбрасывается: та же
 * работа всё равно уходит записью снимка.
 */

export type DeskOpKind = "shift_mark" | "shift_undo";
export interface DeskOpBody {
  eventId: string;
  staffId: string;
  at: number;
  type?: string;
  station?: string;
  reason?: string;
}
export interface DeskOp {
  key: string;
  kind: DeskOpKind;
  body: DeskOpBody;
}
/** Почему сервер не положил операцию в снимок. */
export type OpFlag = "nobody" | "not_present" | "time" | "bad" | "not_yours" | "late";

export interface OpResult {
  key: string;
  status: "applied" | "flagged";
  reason?: string;
  duplicate?: boolean;
}
export type SendOutcome =
  { kind: "ok"; results: OpResult[] } | { kind: "drop" } | { kind: "retry" };

export interface Pending {
  count: number;
  /** С какого времени очередь не пуста. */
  since: number | null;
}

export interface OpQueue {
  enqueue: (kind: DeskOpKind, body: DeskOpBody) => void;
  flush: () => Promise<void>;
  pending: () => Pending;
  subscribe: (fn: () => void) => () => void;
}

export const OPS_KEY = "uklad-desk-ops-v1";
const BATCH = 100;
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
  onFlagged: (reasons: OpFlag[]) => void;
  later: (fn: () => void, ms: number) => void;
  now: () => number;
  newKey: () => string;
}

const isOpLike = (x: unknown): x is DeskOp => {
  if (!x || typeof x !== "object") return false;
  const op = x as DeskOp;
  return (
    typeof op.key === "string" &&
    (op.kind === "shift_mark" || op.kind === "shift_undo") &&
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
        if (out.kind === "ok") {
          const flagged = out.results
            .filter((r) => r.status === "flagged" && !r.duplicate)
            .map((r) => r.reason as OpFlag);
          if (flagged.length > 0) deps.onFlagged(flagged);
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
    if ([400, 403, 404, 409].includes(res.status)) return { kind: "drop" };
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
async function sayFlagged() {
  const { useEditor } = await import("../store");
  useEditor.getState().showToast("ws.opRejected");
}

export const deskOps: OpQueue = createOpQueue({
  send: sendToServer,
  read: () => readLocal(OPS_KEY),
  write: (text) => writeLocal(OPS_KEY, text),
  onFlagged: () => void sayFlagged(),
  later: (fn, ms) => void setTimeout(fn, ms),
  now: () => Date.now(),
  newKey: randomKey,
});

/** Неотправленное — для пометки на рабочем месте. */
export function usePendingOps(): Pending {
  return useSyncExternalStore(deskOps.subscribe, deskOps.pending, deskOps.pending);
}
