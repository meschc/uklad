import type { Origin, Status, Track } from "../../data/roadmap";

/**
 * Цвета дорожной карты (просьба Кирилла 20 окт: «разделить по цветам», чтобы
 * доска читалась как отдельный инструмент, а не как ещё один блок сайта).
 *
 * Цвет — у текста тега и у метки колонки, а не у заливки карточки: бледные
 * подложки Кирилл запретил, а цветной текст на белом остаётся чистым, как у
 * taptop. Каждый цвет — пара для светлой и тёмной темы.
 */
export const TRACK_TONE: Record<Track, string> = {
  plan: "text-[#2247ff] dark:text-[#7b93ff]",
  fulfillment: "text-[#c2410c] dark:text-[#fb923c]",
  staff: "text-[#7c3aed] dark:text-[#a78bfa]",
  integrations: "text-[#0f766e] dark:text-[#2dd4bf]",
  platform: "text-[#4d5562] dark:text-[#a1a4ab]",
  market: "text-[#be185d] dark:text-[#f472b6]",
};

export const ORIGIN_TONE: Record<Origin, string> = {
  warehouses: "text-[#a16207] dark:text-[#facc15]",
  sellers: "text-[#15803d] dark:text-[#4ade80]",
  bug: "text-[#dc2626] dark:text-[#f87171]",
};

/** Метка колонки: от пустого кружка у обсуждения к сплошному у готового. */
export const STATUS_TONE: Record<Status, string> = {
  idea: "bg-[#f59e0b]",
  planned: "bg-[#8b5cf6]",
  progress: "bg-[#2247ff]",
  done: "bg-[#16a34a]",
};
