/**
 * Слой доступа к данным (п.0.4): один тонкий репозиторий на домен.
 *
 * Сегодня внутри — тот же Zustand + localStorage, что и был. Когда дойдёт
 * очередь до Supabase, поменяется реализация репозиториев, а не код экранов и
 * срезов, которые их вызывают. Бизнес-логика (`placement.ts`, `fulfillment.ts`)
 * остаётся чистыми функциями и про хранилище по-прежнему ничего не знает.
 */
export { fulfillmentRepository } from "./fulfillmentRepository";
export { placementRepository } from "./placementRepository";
export { productsRepository } from "./productsRepository";
export { requestsRepository } from "./requestsRepository";
export { staffRepository } from "./staffRepository";
export { sanitizeDomains } from "./sanitize";
export type { Repository, StorePort } from "./repository";
