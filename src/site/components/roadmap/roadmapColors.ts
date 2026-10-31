import type { Origin, Status, Track } from "../../data/roadmap";

/**
 * Цвета дорожной карты (просьба Кирилла 20 окт: «разделить по цветам», чтобы
 * доска читалась как отдельный инструмент, а не как ещё один блок сайта).
 *
 * Цвет — у текста тега и у метки колонки, а не у заливки карточки: бледные
 * подложки Кирилл запретил, а цветной текст на белом остаётся чистым, как у
 * taptop. Каждый цвет — пара для светлой и тёмной темы. Выбранная тема в
 * отборе заливается тем же цветом (Кирилл 26 окт). Новую общую палитру
 * дополнительных цветов Кирилл ещё не утвердил (31 окт) — до тех пор здесь
 * прежние цвета.
 */
type Tone = { text: string; fill: string };

export const TRACK_COLORS: Record<Track, Tone> = {
  plan: {
    text: "text-[#2247ff] dark:text-[#7b93ff]",
    fill: "bg-[#2247ff] text-white dark:bg-[#7b93ff] dark:text-[#0f1013]",
  },
  fulfillment: {
    text: "text-[#c2410c] dark:text-[#fb923c]",
    fill: "bg-[#c2410c] text-white dark:bg-[#fb923c] dark:text-[#0f1013]",
  },
  staff: {
    text: "text-[#7c3aed] dark:text-[#a78bfa]",
    fill: "bg-[#7c3aed] text-white dark:bg-[#a78bfa] dark:text-[#0f1013]",
  },
  integrations: {
    text: "text-[#0f766e] dark:text-[#2dd4bf]",
    fill: "bg-[#0f766e] text-white dark:bg-[#2dd4bf] dark:text-[#0f1013]",
  },
  platform: {
    text: "text-[#4d5562] dark:text-[#a1a4ab]",
    fill: "bg-[#4d5562] text-white dark:bg-[#a1a4ab] dark:text-[#0f1013]",
  },
  market: {
    text: "text-[#be185d] dark:text-[#f472b6]",
    fill: "bg-[#be185d] text-white dark:bg-[#f472b6] dark:text-[#0f1013]",
  },
};

export const ORIGIN_COLORS: Record<Origin, Tone> = {
  warehouses: {
    text: "text-[#a16207] dark:text-[#facc15]",
    fill: "bg-[#a16207] text-white dark:bg-[#facc15] dark:text-[#0f1013]",
  },
  sellers: {
    text: "text-[#15803d] dark:text-[#4ade80]",
    fill: "bg-[#15803d] text-white dark:bg-[#4ade80] dark:text-[#0f1013]",
  },
  bug: {
    text: "text-[#dc2626] dark:text-[#f87171]",
    fill: "bg-[#dc2626] text-white dark:bg-[#f87171] dark:text-[#0f1013]",
  },
};

export const TRACK_TONE = Object.fromEntries(
  Object.entries(TRACK_COLORS).map(([k, v]) => [k, v.text]),
) as Record<Track, string>;

export const ORIGIN_TONE = Object.fromEntries(
  Object.entries(ORIGIN_COLORS).map(([k, v]) => [k, v.text]),
) as Record<Origin, string>;

/** Метка колонки: от пустого кружка у обсуждения к сплошному у готового. */
export const STATUS_TONE: Record<Status, string> = {
  idea: "bg-[#f59e0b]",
  planned: "bg-[#8b5cf6]",
  progress: "bg-[#2247ff]",
  done: "bg-[#16a34a]",
};
