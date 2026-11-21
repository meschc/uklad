/**
 * Версия продукта для интерфейса — та же, что в `package.json` (правило —
 * CLAUDE.md, «Версия продукта»). Берётся при сборке: именованный импорт из
 * JSON Vite встраивает одной строкой, остальной `package.json` в бандл не идёт.
 */
import { version } from "../../package.json";

export const APP_VERSION: string = version;
