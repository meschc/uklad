import type { Origin, Status, Track } from "../../data/roadmap";

/**
 * Цвета дорожной карты — палитра линий метро (Кирилл 31 окт), токены
 * `--tag-*` в `src/index.css`.
 *
 * Цвет живёт только в метке: тег на карточке — залитая пилюля, тема в отборе —
 * точка этого цвета, выбранная тема залита целиком. Цветного текста на белом
 * нет: жёлтый, оранжевый и салатовый в нём не читаются, а одна система меток
 * лучше двух. На светлых заливках текст тёмный (`--tag-ink`).
 */
type Tone = {
  dot: string;
  fill: string;
  /** Наведение на тему в отборе — её же цвет, бледно, а не общий серый. */
  hover: string;
};

// Классы целиком, а не шаблоном: Tailwind находит их только в тексте файла.
export const TRACK_COLORS: Record<Track, Tone> = {
  plan: {
    dot: "bg-[hsl(var(--tag-plan))]",
    hover: "hover:bg-[hsl(var(--tag-plan)/0.14)]",
    fill: "bg-[hsl(var(--tag-plan))] text-white",
  },
  fulfillment: {
    dot: "bg-[hsl(var(--tag-fulfillment))]",
    hover: "hover:bg-[hsl(var(--tag-fulfillment)/0.14)]",
    fill: "bg-[hsl(var(--tag-fulfillment))] text-[hsl(var(--tag-ink))]",
  },
  staff: {
    dot: "bg-[hsl(var(--tag-staff))]",
    hover: "hover:bg-[hsl(var(--tag-staff)/0.14)]",
    fill: "bg-[hsl(var(--tag-staff))] text-white",
  },
  integrations: {
    dot: "bg-[hsl(var(--tag-integrations))]",
    hover: "hover:bg-[hsl(var(--tag-integrations)/0.14)]",
    fill: "bg-[hsl(var(--tag-integrations))] text-white",
  },
  platform: {
    dot: "bg-[hsl(var(--tag-platform))]",
    hover: "hover:bg-[hsl(var(--tag-platform)/0.14)]",
    fill: "bg-[hsl(var(--tag-platform))] text-white",
  },
  market: {
    dot: "bg-[hsl(var(--tag-market))]",
    hover: "hover:bg-[hsl(var(--tag-market)/0.14)]",
    fill: "bg-[hsl(var(--tag-market))] text-[hsl(var(--tag-ink))]",
  },
};

export const ORIGIN_COLORS: Record<Origin, Tone> = {
  warehouses: {
    dot: "bg-[hsl(var(--tag-warehouses))]",
    hover: "hover:bg-[hsl(var(--tag-warehouses)/0.14)]",
    fill: "bg-[hsl(var(--tag-warehouses))] text-white",
  },
  sellers: {
    dot: "bg-[hsl(var(--tag-sellers))]",
    hover: "hover:bg-[hsl(var(--tag-sellers)/0.14)]",
    fill: "bg-[hsl(var(--tag-sellers))] text-[hsl(var(--tag-ink))]",
  },
  bug: {
    dot: "bg-[hsl(var(--tag-bug))]",
    hover: "hover:bg-[hsl(var(--tag-bug)/0.14)]",
    fill: "bg-[hsl(var(--tag-bug))] text-white",
  },
};

/** Тег-пилюля на карточке и в описании идеи. */
const PILL =
  "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold leading-none";

export const TRACK_TONE = Object.fromEntries(
  Object.entries(TRACK_COLORS).map(([k, v]) => [k, `${PILL} ${v.fill}`]),
) as Record<Track, string>;

export const ORIGIN_TONE = Object.fromEntries(
  Object.entries(ORIGIN_COLORS).map(([k, v]) => [k, `${PILL} ${v.fill}`]),
) as Record<Origin, string>;

/** Метка колонки: от пустого кружка у обсуждения к сплошному у готового. */
export const STATUS_TONE: Record<Status, string> = {
  idea: "bg-[hsl(var(--tag-market))]",
  planned: "bg-[hsl(var(--tag-staff))]",
  progress: "bg-[hsl(var(--tag-plan))]",
  done: "bg-[hsl(var(--tag-integrations))]",
};
