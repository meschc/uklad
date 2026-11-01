import { readLocal, writeLocal } from "@/lib/safeStorage";
import type { RoadmapComment, RoadmapPort, SubmittedIdea, VoteValue } from "./port";

/**
 * Локальная реализация порта — до появления сервера.
 *
 * Всё живёт в браузере: «аккаунт» — запись по почте, голоса и идеи — его
 * поля. Счётчик у пункта поэтому честно считает только голоса этого браузера,
 * чужих взять неоткуда. Письма нет: код возвращается в ответе, и окно входа
 * показывает его с пометкой, что сервер ещё не подключён.
 */

const KEY = "uklad.roadmap.local";

interface Account {
  /** Раньше голос был только «за» и хранился списком; список читается как «за». */
  votes: Record<string, VoteValue> | string[];
  ideas: SubmittedIdea[];
}

interface Db {
  accounts: Record<string, Account>;
  /** Выданные коды: почта → код. */
  codes: Record<string, string>;
  comments?: Record<string, RoadmapComment[]>;
}

function votesOf(acc: Account): Record<string, VoteValue> {
  if (!Array.isArray(acc.votes)) return acc.votes;
  return Object.fromEntries(acc.votes.map((id) => [id, 1 as VoteValue]));
}

/** Почта под комментарием не показывается: только псевдоним, иначе «Гость». */
function authorOf(alias: string | null): string {
  return alias?.trim().slice(0, 30) || "Гость";
}

function read(): Db {
  try {
    const parsed = JSON.parse(readLocal(KEY) ?? "null") as Db | null;
    if (parsed && typeof parsed === "object" && parsed.accounts && parsed.codes) return parsed;
  } catch {
    /* битая запись — начинаем с чистого листа */
  }
  return { accounts: {}, codes: {} };
}

function write(db: Db): void {
  writeLocal(KEY, JSON.stringify(db));
}

/** Токен локального входа — это сама почта: проверять его некому и незачем. */
const emailOf = (token: string) => token.replace(/^local:/, "");

function account(db: Db, email: string): Account {
  return (db.accounts[email] ??= { votes: {}, ideas: [] });
}

function counts(db: Db): Record<string, number> {
  const out: Record<string, number> = {};
  for (const acc of Object.values(db.accounts)) {
    for (const [id, value] of Object.entries(votesOf(acc))) out[id] = (out[id] ?? 0) + value;
  }
  return out;
}

export function localPort(): RoadmapPort {
  return {
    live: false,

    async requestCode(email) {
      const db = read();
      const code = String(Math.floor(100000 + Math.random() * 900000));
      db.codes[email] = code;
      write(db);
      return { ok: true, data: { devCode: code } };
    },

    async verifyCode(email, code) {
      const db = read();
      if (db.codes[email] !== code) return { ok: false, error: "code" };
      delete db.codes[email];
      account(db, email);
      write(db);
      return { ok: true, data: { token: `local:${email}`, user: { email } } };
    },

    async load(token) {
      const db = read();
      const own = token ? db.accounts[emailOf(token)] : undefined;
      return {
        ok: true,
        data: { counts: counts(db), mine: own ? votesOf(own) : {}, ideas: own?.ideas ?? [] },
      };
    },

    async vote(token, itemId, value) {
      const db = read();
      const acc = account(db, emailOf(token));
      const votes = votesOf(acc);
      if (value === 0) delete votes[itemId];
      else votes[itemId] = value;
      acc.votes = votes;
      write(db);
      return { ok: true, data: { count: counts(db)[itemId] ?? 0 } };
    },

    async comments(itemId) {
      return { ok: true, data: read().comments?.[itemId] ?? [] };
    },

    async addComment(_token, itemId, text, alias) {
      const clean = text.trim().slice(0, 1000);
      if (!clean) return { ok: false, error: "invalid" };
      const db = read();
      const comment: RoadmapComment = {
        id: `c-${Date.now().toString(36)}`,
        author: authorOf(alias),
        text: clean,
        createdAt: new Date().toISOString(),
      };
      db.comments = { ...db.comments, [itemId]: [...(db.comments?.[itemId] ?? []), comment] };
      write(db);
      return { ok: true, data: comment };
    },

    async submitIdea(token, draft) {
      const db = read();
      const idea: SubmittedIdea = {
        id: `idea-${Date.now().toString(36)}`,
        ...draft,
        status: "review",
        createdAt: new Date().toISOString(),
      };
      account(db, emailOf(token)).ideas.unshift(idea);
      write(db);
      return { ok: true, data: idea };
    },
  };
}
