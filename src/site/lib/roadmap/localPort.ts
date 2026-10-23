import { readLocal, writeLocal } from "@/lib/safeStorage";
import type { RoadmapPort, SubmittedIdea } from "./port";

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
  votes: string[];
  ideas: SubmittedIdea[];
}

interface Db {
  accounts: Record<string, Account>;
  /** Выданные коды: почта → код. */
  codes: Record<string, string>;
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
  return (db.accounts[email] ??= { votes: [], ideas: [] });
}

function counts(db: Db): Record<string, number> {
  const out: Record<string, number> = {};
  for (const acc of Object.values(db.accounts)) {
    for (const id of acc.votes) out[id] = (out[id] ?? 0) + 1;
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
        data: { counts: counts(db), mine: own?.votes ?? [], ideas: own?.ideas ?? [] },
      };
    },

    async vote(token, itemId, on) {
      const db = read();
      const acc = account(db, emailOf(token));
      acc.votes = on
        ? [...new Set([...acc.votes, itemId])]
        : acc.votes.filter((id) => id !== itemId);
      write(db);
      return { ok: true, data: { count: counts(db)[itemId] ?? 0 } };
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
