import { removeLocal } from "../safeStorage";
import { PERSIST_KEY } from "./index";
import { BEFORE_SYNC_KEY, markSignedOut } from "./serverSync";

/**
 * Стереть сохранение кабинета и открыть вход с чистого листа.
 *
 * Кабинет живёт на сервере, браузер держит копию (ADR 0010). Стирание — только
 * по явному действию человека: выход (незаписанное — с подтверждением и
 * «Скачать копию») или вход другой компанией на этом компьютере. Стирается и
 * отложенная при расхождении копия: на общем компьютере после выхода данных
 * компании оставаться не должно. Истёкшая сессия данные не трогает
 * (`sessionLost`).
 * Перезагрузка, а не сброс стора на месте: посев живёт в одном месте — на
 * старте приложения (как «Демо-данные → Загрузить заново»).
 *
 * `offline` — выход не дошёл до сервера: на этом устройстве человек вышел,
 * а сессия на сервере ещё жива. Экран входа скажет об этом прямо.
 * `deleted` — аккаунт назначен к удалению: экран входа напомнит, что 30 дней
 * его можно вернуть, войдя паролем.
 */
export function leaveServerSession(note?: "offline" | "deleted") {
  removeLocal(PERSIST_KEY);
  removeLocal(BEFORE_SYNC_KEY);
  markSignedOut();
  const query = note ? `?view=login&logout=${note}` : "?view=login";
  window.location.replace(`${window.location.pathname}${query}`);
}
