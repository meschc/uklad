/**
 * Слой доступа к данным (п.0.4): один тонкий репозиторий на домен.
 *
 * Сегодня внутри — тот же Zustand + localStorage, что и был. Когда дойдёт
 * очередь до Supabase, поменяется реализация репозиториев, а не код экранов и
 * срезов, которые их вызывают. Бизнес-логика (`placement.ts`, `fulfillment.ts`)
 * остаётся чистыми функциями и про хранилище по-прежнему ничего не знает.
 */
export { catalogRepository } from "./catalogRepository";
export type { FieldOutcome } from "./catalogRepository";
export { chatRepository } from "./chatRepository";
export { fulfillmentRepository } from "./fulfillmentRepository";
export { placementRepository } from "./placementRepository";
export { requestsRepository } from "./requestsRepository";
export { staffRepository } from "./staffRepository";
export { sanitizeDomains } from "./sanitize";
export type { Repository, StorePort } from "./repository";
export { attempt, fail, ok } from "./result";
export type { Result } from "./result";
