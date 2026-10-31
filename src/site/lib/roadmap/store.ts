import { useSyncExternalStore } from "react";
import { readLocal, removeLocal, writeLocal } from "@/lib/safeStorage";
import { localPort } from "./localPort";
import {
  httpPort,
  type BoardState,
  type Consent,
  type IdeaDraft,
  type RoadmapError,
  type RoadmapPort,
  type Session,
  type SubmittedIdea,
} from "./port";

/**
 * Состояние дорожной карты для экранов: сессия, голоса, идеи и открытые окна.
 *
 * Голос засчитывается сразу по нажатию (Кирилл, 21 окт): счётчик меняется
 * до ответа сервера и откатывается, если тот отказал. Без входа нажатие
 * открывает окно входа, а после входа голос ставится сам — человеку не
 * приходится искать карточку второй раз.
 */

const SESSION_KEY = "uklad.roadmap.session";

const API = (import.meta.env.VITE_ROADMAP_API ?? "").trim();
export const port: RoadmapPort = API ? httpPort(API) : localPort();

export type Dialog = null | { kind: "login" } | { kind: "idea" };

export interface RoadmapState {
  session: Session | null;
  counts: Record<string, number>;
  /** Свой голос по пункту: 1 — за, -1 — против. */
  mine: ReadonlyMap<string, 1 | -1>;
  ideas: readonly SubmittedIdea[];
  dialog: Dialog;
  /** Что сделать сразу после входа: поставить голос или открыть форму идеи. */
  after: (() => void) | null;
  error: RoadmapError | null;
}

const EMPTY: RoadmapState = {
  session: null,
  counts: {},
  mine: new Map(),
  ideas: [],
  dialog: null,
  after: null,
  error: null,
};

let state: RoadmapState = EMPTY;
let started = false;
const listeners = new Set<() => void>();

function set(patch: Partial<RoadmapState>): void {
  state = { ...state, ...patch };
  for (const notify of listeners) notify();
}

function applyBoard(board: BoardState): void {
  set({
    counts: board.counts,
    mine: new Map(Object.entries(board.mine) as [string, 1 | -1][]),
    ideas: board.ideas,
  });
}

function readSession(): Session | null {
  try {
    const parsed = JSON.parse(readLocal(SESSION_KEY) ?? "null") as Session | null;
    return parsed && typeof parsed.token === "string" && parsed.user?.email ? parsed : null;
  } catch {
    return null;
  }
}

/** Первое чтение — при первом подписчике, не при импорте: пререндер идёт в Node. */
async function start(): Promise<void> {
  if (started) return;
  started = true;
  const session = readSession();
  set({ session });
  const res = await port.load(session?.token ?? null);
  if (res.ok) applyBoard(res.data);
  else if (res.error === "auth") logout();
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  void start();
  return () => listeners.delete(notify);
}

export function useRoadmap(): RoadmapState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => EMPTY,
  );
}

export function openDialog(dialog: Dialog, after: (() => void) | null = null): void {
  set({ dialog, after, error: null });
}

export function closeDialog(): void {
  set({ dialog: null, after: null, error: null });
}

export function requestCode(email: string, consent: Consent) {
  return port.requestCode(email, consent);
}

/** Проверить код. При успехе — сохранить сессию, перечитать доску и выполнить отложенное. */
export async function verifyCode(email: string, code: string): Promise<RoadmapError | null> {
  const res = await port.verifyCode(email, code);
  if (!res.ok) return res.error;
  writeLocal(SESSION_KEY, JSON.stringify(res.data));
  const after = state.after;
  set({ session: res.data, dialog: null, after: null });
  const board = await port.load(res.data.token);
  if (board.ok) applyBoard(board.data);
  after?.();
  return null;
}

export function logout(): void {
  removeLocal(SESSION_KEY);
  set({ session: null, mine: new Map(), ideas: [] });
}

/**
 * Голос стрелкой. Повторное нажатие той же стрелки снимает голос, нажатие
 * противоположной переставляет его: итог меняется на 2. Без входа — окно
 * входа, а после входа голос ставится сам.
 */
export function castVote(itemId: string, dir: 1 | -1): void {
  const session = state.session;
  if (!session) {
    openDialog({ kind: "login" }, () => {
      if (!state.mine.has(itemId)) castVote(itemId, dir);
    });
    return;
  }

  const prev = state.mine.get(itemId) ?? 0;
  const next = prev === dir ? 0 : dir;
  const before = { counts: state.counts, mine: state.mine };
  const mine = new Map(state.mine);
  if (next === 0) mine.delete(itemId);
  else mine.set(itemId, next);
  set({ mine, counts: { ...state.counts, [itemId]: (state.counts[itemId] ?? 0) + next - prev } });

  void port.vote(session.token, itemId, next).then((res) => {
    if (res.ok) {
      set({ counts: { ...state.counts, [itemId]: res.data.count } });
      return;
    }
    set({ ...before, error: res.error });
    if (res.error === "auth") logout();
  });
}

/** Старое имя: голос «за». */
export const toggleVote = (itemId: string): void => castVote(itemId, 1);

export function loadComments(itemId: string) {
  return port.comments(itemId);
}

/** Комментарий пишет только вошедший: без входа вернём `auth`, окно входа откроет вызывающий. */
export async function postComment(itemId: string, text: string, alias: string | null) {
  const session = state.session;
  if (!session) return { ok: false, error: "auth" } as const;
  const res = await port.addComment(session.token, itemId, text, alias);
  if (!res.ok && res.error === "auth") logout();
  return res;
}

/** Отправить идею. Без входа форма сначала просит войти (см. `RoadmapIdeaForm`). */
export async function submitIdea(draft: IdeaDraft): Promise<RoadmapError | SubmittedIdea> {
  const session = state.session;
  if (!session) return "auth";
  const res = await port.submitIdea(session.token, draft);
  if (!res.ok) {
    if (res.error === "auth") logout();
    return res.error;
  }
  set({ ideas: [res.data, ...state.ideas] });
  return res.data;
}

/** Только для тестов: вернуть модуль в исходное состояние. */
export function resetRoadmapStore(): void {
  state = EMPTY;
  started = false;
}
