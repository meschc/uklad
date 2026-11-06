import type { Track } from "../../data/roadmap";

/**
 * Порт дорожной карты — всё, что доске нужно от сервера.
 *
 * Сервера пока нет (Кирилл поднимет свой в конце октября 2026), поэтому
 * сегодня под портом лежит локальная реализация (`localPort`), а сетевая
 * (`httpPort`) включается переменной `VITE_ROADMAP_API`. Экраны знают только
 * этот интерфейс: когда сервер появится, меняется одна строка в `store.ts`,
 * а не окна входа и карточки. Договор с сервером описан в
 * `docs/roadmap-api.md` — правится вместе с этим файлом.
 */

export interface RoadmapUser {
  email: string;
}

export interface Session {
  token: string;
  user: RoadmapUser;
}

/** Голос: 1 — за, -1 — против; 0 снимает свой голос. */
export type VoteValue = -1 | 0 | 1;

/** Комментарий к пункту. Автор — псевдоним, который человек выбрал сам, иначе «Гость». */
export interface RoadmapComment {
  id: string;
  author: string;
  text: string;
  /** ISO-дата. */
  createdAt: string;
}

/** Идея, присланная посетителем. До разбора видна только автору. */
export interface SubmittedIdea {
  id: string;
  title: string;
  details: string;
  track: Track | null;
  /** review — ждёт разбора; accepted — стала пунктом карты; declined — отклонена. */
  status: "review" | "accepted" | "declined";
  /** ISO-дата отправки. */
  createdAt: string;
}

export interface IdeaDraft {
  title: string;
  details: string;
  track: Track | null;
}

/** Состояние доски для посетителя: голоса всех и его собственные. */
export interface BoardState {
  /** Итог голосов (за минус против) по id пункта. Пункта без голосов в словаре может не быть. */
  counts: Record<string, number>;
  /** Голос вошедшего посетителя по id пункта: 1 — за, -1 — против. Без входа — пусто. */
  mine: Record<string, VoteValue>;
  /** Его идеи. Без входа — пусто. */
  ideas: SubmittedIdea[];
}

/** Почему не вышло. Ключ, а не текст: подпись выбирает интерфейс. */
export type RoadmapError = "network" | "invalid" | "code" | "expired" | "auth" | "limit";

export type Result<T> = { ok: true; data: T } | { ok: false; error: RoadmapError };

export interface Consent {
  data: boolean;
  ads: boolean;
}

export interface RoadmapPort {
  /** Есть ли настоящий сервер. Без него письмо не уходит — интерфейс так и говорит. */
  readonly live: boolean;
  /**
   * Выслать код входа на почту. Локальная реализация письма не шлёт и
   * возвращает код в ответе (`devCode`), чтобы сценарий можно было пройти.
   */
  requestCode(email: string, consent: Consent): Promise<Result<{ devCode?: string }>>;
  verifyCode(email: string, code: string): Promise<Result<Session>>;
  load(token: string | null): Promise<Result<BoardState>>;
  /** Поставить голос (`1` или `-1`) или снять (`0`). Возвращает новый итог пункта. */
  vote(token: string, itemId: string, value: VoteValue): Promise<Result<{ count: number }>>;
  /** Комментарии к пункту: читать может любой, писать — вошедший. */
  comments(itemId: string): Promise<Result<RoadmapComment[]>>;
  addComment(
    token: string,
    itemId: string,
    text: string,
    alias: string | null,
  ): Promise<Result<RoadmapComment>>;
  submitIdea(token: string, draft: IdeaDraft): Promise<Result<SubmittedIdea>>;
}

/** Сетевая реализация по договору `docs/roadmap-api.md`. */
export function httpPort(base: string): RoadmapPort {
  const root = base.replace(/\/+$/, "");

  async function call<T>(
    path: string,
    init: RequestInit & { token?: string | null } = {},
  ): Promise<Result<T>> {
    const { token, ...rest } = init;
    try {
      const res = await fetch(`${root}${path}`, {
        ...rest,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (res.ok) {
        const data = res.status === 204 ? ({} as T) : ((await res.json()) as T);
        return { ok: true, data };
      }
      const error: RoadmapError =
        res.status === 401
          ? "auth"
          : res.status === 410
            ? "expired"
            : res.status === 429
              ? "limit"
              : res.status === 422
                ? "code"
                : "invalid";
      return { ok: false, error };
    } catch (err) {
      console.warn("[roadmap] сеть", err);
      return { ok: false, error: "network" };
    }
  }

  return {
    live: true,
    requestCode: (email, consent) =>
      call("/auth/code", { method: "POST", body: JSON.stringify({ email, consent }) }),
    verifyCode: (email, code) =>
      call("/auth/verify", { method: "POST", body: JSON.stringify({ email, code }) }),
    load: (token) => call("/board", { token }),
    vote: (token, itemId, value) =>
      call(`/votes/${encodeURIComponent(itemId)}`, {
        method: value === 0 ? "DELETE" : "PUT",
        token,
        ...(value === 0 ? {} : { body: JSON.stringify({ value }) }),
      }),
    comments: (itemId) => call(`/comments/${encodeURIComponent(itemId)}`),
    addComment: (token, itemId, text, alias) =>
      call(`/comments/${encodeURIComponent(itemId)}`, {
        method: "POST",
        token,
        body: JSON.stringify({ text, alias }),
      }),
    submitIdea: (token, draft) =>
      call("/ideas", { method: "POST", token, body: JSON.stringify(draft) }),
  };
}
