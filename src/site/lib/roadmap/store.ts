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
  mine: ReadonlySet<string>;
  ideas: readonly SubmittedIdea[];
  dialog: Dialog;
  /** Что сделать сразу после входа: поставить голос или открыть форму идеи. */
  after: (() => void) | null;
  error: RoadmapError | null;
}

const EMPTY: RoadmapState = {
  session: null,
  counts: {},
  mine: new Set(),
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
  set({ counts: board.counts, mine: new Set(board.mine), ideas: board.ideas });
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
  set({ session: null, mine: new Set(), ideas: [] });
}

/** Голос по нажатию: без входа — окно входа, после входа голос ставится сам. */
export function toggleVote(itemId: string): void {
  const session = state.session;
  if (!session) {
    openDialog({ kind: "login" }, () => {
      if (!state.mine.has(itemId)) toggleVote(itemId);
    });
    return;
  }

  const on = !state.mine.has(itemId);
  const before = { counts: state.counts, mine: state.mine };
  const mine = new Set(state.mine);
  if (on) mine.add(itemId);
  else mine.delete(itemId);
  const count = Math.max(0, (state.counts[itemId] ?? 0) + (on ? 1 : -1));
  set({ mine, counts: { ...state.counts, [itemId]: count } });

  void port.vote(session.token, itemId, on).then((res) => {
    if (res.ok) {
      set({ counts: { ...state.counts, [itemId]: res.data.count } });
      return;
    }
    set({ ...before, error: res.error });
    if (res.error === "auth") logout();
  });
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
