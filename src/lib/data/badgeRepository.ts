import { badgeCode } from "../workstation";
import { apiRequest } from "./api";
import { storePort, type StorePort } from "./repository";
import { attempt, fail, ok, type Result } from "./result";

/**
 * Бейджи рабочего места (п.0.4). В демо бейдж — id сотрудника, его можно
 * напечатать сразу. В сборке с сервером в QR случайный секрет: выпускает,
 * гасит и проверяет его сервер (`server/api/src/cabinet/deskBadges.js`),
 * а кабинет узнаёт код один раз — при выпуске.
 *
 * Какой путь брать, решает сессия (`session.source`), а не сборка: в
 * серверной сборке демо по заявке по-прежнему живёт в браузере.
 */
export interface BadgeServer {
  /** Чей это бейдж: id сотрудника или `null`, если чужой или погашен. */
  check: (code: string) => Promise<Result<string | null>>;
  issue: (staffId: string) => Promise<Result<string>>;
  revoke: (staffId: string) => Promise<Result<void>>;
}

export const serverBadges: BadgeServer = {
  check: async (code) => {
    const res = await attempt(() => apiRequest("POST", "/cabinet/badges/check", { code }));
    if (!res.ok) return res;
    const { status, body } = res.data;
    if (status === 404) return ok(null);
    if (status !== 200 || typeof body.staffRef !== "string") return fail("data.failed");
    return ok(body.staffRef);
  },
  issue: async (staffId) => {
    const res = await attempt(() =>
      apiRequest("POST", "/cabinet/badges/issue", { staffRef: staffId }),
    );
    if (!res.ok) return res;
    const { status, body } = res.data;
    if (status !== 200 || typeof body.code !== "string") return fail("data.failed");
    return ok(body.code);
  },
  revoke: async (staffId) => {
    const res = await attempt(() =>
      apiRequest("POST", "/cabinet/badges/revoke", { staffRef: staffId }),
    );
    if (!res.ok) return res;
    return res.data.status === 200 ? ok(undefined) : fail("data.failed");
  },
};

/** Идёт ли работа через сервер: вход паролем, а не демо в браузере. */
export const onServer = (port: StorePort) => port.get().session.source === "server";

export interface BadgeRepository {
  /** Можно ли бейдж погасить: демо-бейдж из id не гаснет, его код вечен. */
  revocable: () => boolean;
  /**
   * Выпустить бейдж и получить код для печати. На сервере старый бейдж
   * сотрудника гаснет, а новый код показывается только сейчас.
   */
  issue: (staffId: string) => Promise<Result<string>>;
  revoke: (staffId: string) => Promise<Result<void>>;
}

export function createBadgeRepository(
  port: StorePort = storePort,
  server: BadgeServer = serverBadges,
): BadgeRepository {
  return {
    revocable: () => onServer(port),
    issue: async (staffId) => (onServer(port) ? server.issue(staffId) : ok(badgeCode(staffId))),
    revoke: async (staffId) => (onServer(port) ? server.revoke(staffId) : ok(undefined)),
  };
}

export const badgeRepository = createBadgeRepository();
