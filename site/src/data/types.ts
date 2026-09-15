/**
 * Модель публичного роадмапа.
 *
 * Роадмап — это обещание снаружи и план внутри, поэтому у пункта две разные
 * даты: `quarter` — ориентир, который можно двигать, и `shippedAt` — факт,
 * который двигать уже нельзя. Смешивать их в одно поле нельзя: тогда
 * «планировали на весну» и «вышло весной» станут неразличимы, а именно на этом
 * различии и держится доверие к публичной странице.
 */

/** Стадия работы. Порядок значений = порядок колонок на борде. */
export type Status = "idea" | "planned" | "progress" | "done";

/** Направление работы — по нему фильтруют борд. */
export type Track = "plan" | "fulfillment" | "integrations" | "platform";

export interface RoadmapItem {
  id: string;
  title: string;
  /** Одна фраза о том, что человек получит. Не «что мы сделаем». */
  summary: string;
  status: Status;
  track: Track;
  /** Ориентир по кварталу: «2026-Q4». У готового — квартал выхода. */
  quarter: string;
  /** Веха, к которой пункт относится (`Milestone.id`). */
  milestone: string;
  /** Голоса пользователей. Локальный голос прибавляется поверх этого числа. */
  votes: number;
  /** Дата выхода, ISO. Есть только у `status: "done"`. */
  shippedAt?: string;
  /** Версия, в которой вышло (`Release.version`). */
  version?: string;
}

/** Крупный этап: несколько пунктов, которые имеют смысл только вместе. */
export interface Milestone {
  id: string;
  title: string;
  /** Зачем этап нужен клиенту — одной фразой. */
  goal: string;
  /** Ориентир завершения: «2026-Q4». */
  target: string;
}

/** Запись в журнале обновлений. */
export interface Release {
  version: string;
  /** Дата выпуска, ISO. */
  date: string;
  title: string;
  /** Что вошло — короткими строками, как человек их увидит в продукте. */
  highlights: string[];
}
