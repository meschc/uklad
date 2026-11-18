/**
 * Подкачка заказов площадок в заявки склада (шаг 2 `docs/domain/fbs.md`).
 *
 * Пока кабинет руководителя открыт, раз в 90 секунд спрашивает у каждой
 * подключённой площадки неотгруженные заказы и заводит новые заявками
 * активного склада. Ключи на сервере, сюда приходят только заказы.
 *
 * Ограничения, о которых надо знать складу: кабинет закрыт — подкачки нет
 * (кнопка «Загрузить заказы» делает то же самое разом); у Ozon — первые 100
 * неотгруженных за раз. Две вкладки одного браузера не качают вдвоём
 * (`navigator.locks`); два руководителя в разных браузерах в одну минуту
 * теоретически могут завести заказ дважды — форма заявок помечает дубль
 * номера, а перенос подкачки на сервер снимет это совсем.
 */

import { getConnector } from "./connectors";
import { connectorsRepository } from "./data/connectorsRepository";
import { requestsRepository } from "./data/requestsRepository";
import { fail, ok, type Result } from "./data/result";
import type { MsgKey } from "./i18n";
import { planOrderImport, productsOfConnection } from "./orderImport";
import { useEditor } from "./store";
import { productsOfWarehouse } from "./warehouseProducts";

export interface OrderSyncResult {
  /** Новых заказов заведено заявками. */
  created: number;
  /** Номера заказов, товар которых не нашёлся в номенклатуре. */
  unknown: string[];
}

const PERIOD_MS = 90_000;
let running: Promise<Result<OrderSyncResult>> | null = null;

async function syncOnce(): Promise<Result<OrderSyncResult>> {
  const conns = await connectorsRepository.list();
  if (!conns.ok) return conns;
  const result: OrderSyncResult = { created: 0, unknown: [] };
  let error: MsgKey | null = null;
  let answered = false;
  for (const c of conns.data) {
    const fetched = await getConnector(c.system, c.id)?.fetchOrders?.();
    if (!fetched) continue;
    // Одна площадка не ответила — остальные всё равно заводим.
    if (!fetched.ok) {
      error ??= fetched.error;
      continue;
    }
    answered = true;
    const s = useEditor.getState();
    const plan = planOrderImport(
      fetched.data,
      productsOfConnection(productsOfWarehouse(s.products, s.warehouse), c.partnerId),
      s.requests,
    );
    if (plan.items.length) {
      const made = await requestsRepository.create(plan.items);
      if (!made.ok) return made;
    }
    result.created += plan.orders;
    result.unknown.push(...plan.unknown);
  }
  return answered || !error ? ok(result) : fail(error);
}

/** Один проход сейчас. Параллельный вызов ждёт уже идущий, а не запускает второй. */
export function syncOrdersNow(): Promise<Result<OrderSyncResult>> {
  running ??= syncOnce().finally(() => {
    running = null;
  });
  return running;
}

/** Фоновая подкачка; возвращает выключатель. */
export function startOrderSync(): () => void {
  const tick = () => {
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    if (!locks) return void syncOrdersNow();
    // Вкладка, которая не взяла замок, этот проход пропускает.
    void locks.request("uklad-order-sync", { ifAvailable: true }, (lock) =>
      lock ? syncOrdersNow() : undefined,
    );
  };
  const first = setTimeout(tick, 5_000);
  const every = setInterval(tick, PERIOD_MS);
  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}
