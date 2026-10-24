import { fail, ok, type Result } from "../data/result";
import type { MsgKey } from "../i18n";
import { anonymizeSnapshot, type AnonymizeStats } from "./anonymize";
import { journal, scrubText, type JournalEntry } from "./journal";

/**
 * Обращение «Сообщить о проблеме»: что пишет человек, журнал событий и, по его
 * галочке, обезличенный снимок данных. Уходит на сервер Уклада
 * (`POST /api/support/reports`) и попадает в раздел «Поддержка» админки.
 *
 * Сборка и отправка разделены: окно сначала показывает, что именно уйдёт
 * (`buildReport`), и только по кнопке отправляет (`sendReport`). Человек
 * должен видеть, что он отдаёт.
 */

export const REPORT_VERSION = 1;
/** Предел тела на сервере — держим его и здесь, чтобы не слать заведомый отказ. */
export const MAX_REPORT_BYTES = 512 * 1024;
export const MAX_MESSAGE = 4000;

export interface ReportEnv {
  userAgent: string;
  language: string;
  screen: string;
  timezone: string;
  /** Экран, с которого нажали кнопку. */
  view: string;
}

export interface SupportReport {
  version: number;
  createdAt: string;
  message: string;
  env: ReportEnv;
  journal: JournalEntry[];
  snapshot?: { data: unknown; stats: AnonymizeStats };
}

export function readEnv(view: string): ReportEnv {
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  const scr = typeof screen === "undefined" ? undefined : screen;
  return {
    userAgent: nav?.userAgent ?? "",
    language: nav?.language ?? "",
    screen: scr ? `${scr.width}x${scr.height}` : "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
    view,
  };
}

export function buildReport(input: {
  message: string;
  env: ReportEnv;
  /** Сохранённое состояние стора — или `null`, если снимок не прикладываем. */
  state: unknown | null;
  entries?: JournalEntry[];
  now?: Date;
}): SupportReport {
  const report: SupportReport = {
    version: REPORT_VERSION,
    createdAt: (input.now ?? new Date()).toISOString(),
    // Своё сообщение человек пишет сам, но почту или телефон в нём тоже
    // стираем: ответ придёт в кабинет, а не на контакт из текста.
    message: scrubText(input.message.trim()).slice(0, MAX_MESSAGE),
    env: input.env,
    journal: input.entries ?? journal.read(),
  };
  if (input.state != null) report.snapshot = anonymizeSnapshot(input.state);
  return report;
}

export function reportSize(report: SupportReport): number {
  return new TextEncoder().encode(JSON.stringify(report)).length;
}

function statusToError(status: number): MsgKey {
  if (status === 413) return "support.error.tooLarge";
  if (status === 429) return "support.error.tooOften";
  return "support.error.failed";
}

/**
 * Отправить обращение. `baseUrl` пустой — тот же адрес, что у кабинета:
 * сервер Уклада стоит за тем же доменом (`/api/*` проксирует Caddy).
 */
export async function sendReport(
  report: SupportReport,
  fetchImpl: typeof fetch = fetch,
  baseUrl = "",
): Promise<Result<{ id: number }>> {
  if (reportSize(report) > MAX_REPORT_BYTES) return fail("support.error.tooLarge");
  try {
    const res = await fetchImpl(`${baseUrl}/api/support/reports`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(report),
    });
    if (!res.ok) return fail(statusToError(res.status));
    const body = (await res.json()) as { ok?: boolean; id?: number };
    return body.ok && typeof body.id === "number"
      ? ok({ id: body.id })
      : fail("support.error.failed");
  } catch (e) {
    console.error("[uklad] обращение не отправлено:", e);
    return fail("support.error.failed");
  }
}
