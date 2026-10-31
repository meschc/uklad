import type { Origin, Status, Track } from "../../data/roadmap";

/**
 * Цвета дорожной карты (Кирилл 20 окт: «разделить по цветам»; 26 окт:
 * «согласовать доп цвета», активный фильтр — в цвет раздела).
 *
 * Палитра — одна шкала, а не шесть цветов на глаз: синий фирменный плюс
 * пять тонов одной светлоты и насыщенности (OKLCH L 0.55, C 0.15; в тёмной
 * теме L 0.78), поэтому ни один раздел не кричит громче соседа, а белый
 * текст на заливке читается у всех одинаково. Серый — у «Платформы»: это
 * не раздел продукта, а то, на чём он стоит.
 *
 * Цвет — у текста тега и у метки колонки, а не у заливки карточки: бледные
 * подложки Кирилл запретил. Заливка — только у выбранного фильтра.
 */
interface Tone {
  /** Текст тега на белом. */
  text: string;
  /** Выбранный фильтр: заливка цветом и контрастный текст. */
  fill: string;
}

// Классы Tailwind собираются из строк в исходнике, поэтому каждый записан
// целиком: склейка через шаблон сборщик стилей не увидит.
const BLUE: Tone = {
  text: "text-[var(--wh-blue)] dark:text-[#7ba7ff]",
  fill: "bg-[var(--wh-blue)] text-white dark:bg-[#7ba7ff] dark:text-[#0f1013]",
};
const AMBER: Tone = {
  text: "text-[#ab5a00] dark:text-[#eca760]",
  fill: "bg-[#ab5a00] text-white dark:bg-[#eca760] dark:text-[#0f1013]",
};
const VIOLET: Tone = {
  text: "text-[#795bbf] dark:text-[#bda8fc]",
  fill: "bg-[#795bbf] text-white dark:bg-[#bda8fc] dark:text-[#0f1013]",
};
const TEAL: Tone = {
  text: "text-[#008a8d] dark:text-[#3bcfcf]",
  fill: "bg-[#008a8d] text-white dark:bg-[#3bcfcf] dark:text-[#0f1013]",
};
const ROSE: Tone = {
  text: "text-[#b64466] dark:text-[#f896ad]",
  fill: "bg-[#b64466] text-white dark:bg-[#f896ad] dark:text-[#0f1013]",
};
const GRAPHITE: Tone = {
  text: "text-[#4d5562] dark:text-[#a1a4ab]",
  fill: "bg-[#4d5562] text-white dark:bg-[#a1a4ab] dark:text-[#0f1013]",
};
/** Нейтральный — у происхождения пункта: это пометка, а не раздел. */
const INK: Tone = {
  text: "text-[var(--wh-ink)]",
  fill: "bg-[var(--wh-ink)] text-[var(--wh-ground)]",
};
const RED: Tone = {
  text: "text-[#dc2626] dark:text-[#f87171]",
  fill: "bg-[#dc2626] text-white dark:bg-[#f87171] dark:text-[#0f1013]",
};

export const TRACK_COLORS: Record<Track, Tone> = {
  plan: BLUE,
  fulfillment: AMBER,
  staff: VIOLET,
  integrations: TEAL,
  platform: GRAPHITE,
  market: ROSE,
};

export const ORIGIN_COLORS: Record<Origin, Tone> = {
  warehouses: INK,
  sellers: INK,
  bug: RED,
};

export const TRACK_TONE: Record<Track, string> = Object.fromEntries(
  Object.entries(TRACK_COLORS).map(([k, v]) => [k, v.text]),
) as Record<Track, string>;

export const ORIGIN_TONE: Record<Origin, string> = Object.fromEntries(
  Object.entries(ORIGIN_COLORS).map(([k, v]) => [k, v.text]),
) as Record<Origin, string>;

/** Метка колонки — те же тона: обсуждение янтарное, план фиолетовый, работа синяя, готово зелёное. */
export const STATUS_TONE: Record<Status, string> = {
  idea: "bg-[#ab5a00] dark:bg-[#eca760]",
  planned: "bg-[#795bbf] dark:bg-[#bda8fc]",
  progress: "bg-[var(--wh-blue)] dark:bg-[#7ba7ff]",
  done: "bg-[#05893e] dark:bg-[#7ccd8e]",
};
