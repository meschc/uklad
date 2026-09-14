/// <reference types="vite/client" />

/**
 * Переменные окружения проекта — те, что перечислены в `.env.example`.
 *
 * Объявление дописывается к типу из `vite/client` (слияние интерфейсов), а не
 * заменяет его: `BASE_URL`, `DEV` и прочее остаётся на месте. Все поля
 * необязательные, потому что переменной в сборке может не оказаться вовсе —
 * пустой `VITE_LEADS_ENDPOINT` для форм витрины это штатное состояние, а не
 * ошибка настройки.
 */
interface ImportMetaEnv {
  /** Адрес API кабинета. Пока не используется: данных нет ни у кого. */
  readonly VITE_API_URL?: string;
  /** Канонический домен витрины для canonical, hreflang и sitemap. */
  readonly VITE_SITE_ORIGIN?: string;
  /** Приёмник заявок с форм витрины (`src/site/lib/leads.ts`). */
  readonly VITE_LEADS_ENDPOINT?: string;
  /** Номер счётчика Яндекс.Метрики. Пусто — счётчик не подключается. */
  readonly VITE_METRIKA_ID?: string;
}
