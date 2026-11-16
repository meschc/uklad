import { readLocal, removeLocal, writeLocal } from "../safeStorage";
import { hasCabinetServer } from "../data/api";
import { PERSIST_KEY } from "./persistStorage";

/**
 * Версия демо-посева. Демо без сервера живёт в браузере посетителя, и посев
 * применяется один раз — вернувшийся через месяц видел бы демо двухнедельной
 * давности без новых экранов. Поэтому у посева есть номер: у посетителя он
 * записан отдельным ключом (не в сохранении — чтобы не трогать `PERSIST_VERSION`
 * и резервные копии), и при расхождении демо собирается заново.
 *
 * Поднимайте число, когда посев изменился так, что старый посетитель что-то
 * не увидит: новый домен данных, новый склад, новая история, новые услуги.
 * Правка опечатки в имени сотрудника — не повод: посетитель потеряет свои
 * правки в демо. Правило и тест покрытия — в CLAUDE.md.
 */
export const DEMO_SEED_VERSION = 1;

/** Где у посетителя записан номер посева, под которым собрано его демо. */
export const DEMO_SEED_KEY = "uklad-demo-seed";

/**
 * Пора ли собрать демо заново. Только для демо без сервера: кабинет с сервером
 * хранит настоящие данные компании, их не заменяет никакой посев. Посетителя
 * без записи о версии считаем отставшим — его демо собрано до появления номера.
 */
export function isDemoStale(
  hadSaved: boolean,
  storedVersion: string | null,
  server: boolean = hasCabinetServer,
): boolean {
  if (server || !hadSaved) return false;
  return Number(storedVersion) !== DEMO_SEED_VERSION;
}

/**
 * Вызывается на старте стора ДО чтения сохранения: устаревшее демо стирается,
 * и стор собирается как при первом запуске. Номер записывается всегда — у
 * нового посетителя тоже, иначе он «отстал» бы со следующей выкладкой.
 *
 * Стираем через `removeLocal`, а не `removeSaved`: тот замораживает запись
 * стора до перезагрузки, а нам нужно, чтобы свежее демо сохранилось.
 */
export function refreshStaleDemo(hadSaved: boolean): boolean {
  const stale = isDemoStale(hadSaved, readLocal(DEMO_SEED_KEY));
  if (stale) removeLocal(PERSIST_KEY);
  if (!hasCabinetServer) writeLocal(DEMO_SEED_KEY, String(DEMO_SEED_VERSION));
  return stale;
}
