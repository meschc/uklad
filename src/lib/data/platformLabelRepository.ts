import type { MsgKey } from "../i18n";
import { apiRequest, hasCabinetServer } from "./api";
import { attempt } from "./result";

/** Ответ на «ярлык площадки»: PDF в base64 или причина с ответом площадки. */
export type PlatformLabelAnswer =
  { ok: true; file: string } | { ok: false; error: MsgKey; detail: string };

const ERROR: Record<string, MsgKey> = {
  not_picked: "ws.plabel.err.notPicked",
  no_connection: "ws.plabel.err.noConnection",
  not_marketplace: "ws.plabel.err.noConnection",
};

/**
 * Ярлык площадки для заявки стола (`POST /api/desk/platform-label`,
 * `server/api/src/cabinet/deskLabel.js`). Ключ площадки у сервера: стол
 * получает только PDF. Без сервера (демо) ярлыка нет.
 */
export const platformLabelRepository = {
  available: () => hasCabinetServer,
  fetch: async (requestId: string): Promise<PlatformLabelAnswer> => {
    const res = await attempt(() => apiRequest("POST", "/desk/platform-label", { requestId }));
    if (!res.ok) return { ok: false, error: res.error, detail: "" };
    const { status, body } = res.data;
    const b = body as { file?: unknown; error?: unknown; detail?: unknown };
    if (status === 200 && typeof b.file === "string") return { ok: true, file: b.file };
    const detail = typeof b.detail === "string" ? b.detail : "";
    const code = typeof b.error === "string" ? b.error : "";
    return { ok: false, error: ERROR[code] ?? "ws.plabel.err.platform", detail };
  },
};
