import type { TFunc } from "@/lib/i18n";
import { nowMs } from "@/lib/utils";

/**
 * Подписи времени в чате. Отдельный файл, потому что одни и те же правила
 * нужны и списку переписок, и разделителям в ленте, а разъехавшись, они дают
 * знакомую нелепость: в списке «вчера», в ленте — дата.
 */

const DAY_MS = 86_400_000;

/** Начало суток по локальному времени. */
function dayStart(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Сколько суток назад это было относительно сегодняшнего дня. */
function daysAgo(at: number, now: number): number {
  return Math.round((dayStart(now) - dayStart(at)) / DAY_MS);
}

/** Часы и минуты — время сообщения в ленте. */
export function formatChatTime(at: number, t: TFunc): string {
  return new Date(at).toLocaleTimeString(t.lang, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Отметка последнего сообщения в списке переписок: сегодня — время, вчера —
 * словом, дальше — дата. Год показываем только для прошлых лет: «12.03» в
 * списке за текущий год читается быстрее, чем «12.03.2026».
 */
export function formatChatStamp(at: number, t: TFunc): string {
  const now = nowMs();
  const ago = daysAgo(at, now);
  if (ago === 0) return formatChatTime(at, t);
  if (ago === 1) return t("chat.yesterday");
  const sameYear = new Date(at).getFullYear() === new Date(now).getFullYear();
  return new Date(at).toLocaleDateString(t.lang, {
    day: "2-digit",
    month: "2-digit",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** Заголовок дня-разделителя в ленте. */
export function formatChatDay(at: number, t: TFunc): string {
  const ago = daysAgo(at, nowMs());
  if (ago === 0) return t("chat.today");
  if (ago === 1) return t("chat.yesterday");
  return new Date(at).toLocaleDateString(t.lang, {
    day: "numeric",
    month: "long",
    ...(new Date(at).getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }),
  });
}

/**
 * Инициалы для кружка собеседника. Берём первые буквы двух первых слов, но
 * пропускаем организационные приставки: «ООО „Технопарк"» без этого выглядит
 * как «ОТ» у каждого второго партнёра.
 */
const SKIP = new Set(["ооо", "оао", "зао", "ип", "пао", "ao", "llc", "ltd", "inc"]);

export function chatInitials(name: string): string {
  const words = name
    .replace(/[«»"“”]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !SKIP.has(w.toLowerCase()));
  const source = words.length ? words : [name.trim() || "?"];
  return source
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
