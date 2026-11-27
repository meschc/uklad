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
export const DEMO_SEED_VERSION = 6;

/** Где у посетителя записан номер посева, под которым собрано его демо. */
export const DEMO_SEED_KEY = "uklad-demo-seed";

/** Где записан момент посева: даты демо считаются от него (сегодня минус N дней). */
const DEMO_SEEDED_AT_KEY = "uklad-demo-seeded-at";

/**
 * Через сколько дней демо считается «несвежим»: даты в нём относительные
 * (заказ «вчера», рейс «через 3 дня»), а считаются они от дня посева. Вернулся
 * через месяц — «вчера» стало месяц назад, рейсы позади, отгрузки просрочены.
 * Неделя: проходит рабочий цикл склада, правки посетителя в демо за это время
 * — не то, ради чего возвращаются.
 */
export const DEMO_MAX_AGE_DAYS = 7;

/**
 * Пора ли собрать демо заново. Только для демо без сервера: кабинет с сервером
 * хранит настоящие данные компании, их не заменяет никакой посев. Посетителя
 * без записи о версии считаем отставшим — его демо собрано до появления номера.
 */
export function isDemoStale(
  hadSaved: boolean,
  storedVersion: string | null,
  server: boolean = hasCabinetServer,
  seededAt: string | null = null,
  now: number = Date.now(),
): boolean {
  if (server || !hadSaved) return false;
  if (Number(storedVersion) !== DEMO_SEED_VERSION) return true;
  // Момент посева неизвестен (демо собрано до появления ключа) — не трогаем:
  // ключ запишется на этом запуске, и отсчёт пойдёт с него.
  const at = Number(seededAt);
  if (!seededAt || !Number.isFinite(at)) return false;
  return now - at > DEMO_MAX_AGE_DAYS * 86_400_000;
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
  const seededAt = readLocal(DEMO_SEEDED_AT_KEY);
  const stale = isDemoStale(hadSaved, readLocal(DEMO_SEED_KEY), hasCabinetServer, seededAt);
  if (stale) removeLocal(PERSIST_KEY);
  if (!hasCabinetServer) {
    writeLocal(DEMO_SEED_KEY, String(DEMO_SEED_VERSION));
    // Новый посев (первый запуск или пересборка) — отсчёт с сегодняшнего дня;
    // у уже собранного демо без метки — тоже с этого запуска.
    if (stale || !hadSaved || !seededAt) writeLocal(DEMO_SEEDED_AT_KEY, String(Date.now()));
  }
  return stale;
}
