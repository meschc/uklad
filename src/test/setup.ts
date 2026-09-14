import { afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";

/**
 * Общая подготовка тестов.
 *
 * Два дополнения к vitest, оба нужны только компонентным тестам, но подключены
 * для всех: файл дешёвый, а разводить ради него два разных запуска — дороже.
 *
 * Первое — проверки про разметку (`toBeDisabled`, `toBeChecked`). Без них
 * пришлось бы писать `expect(el.hasAttribute("disabled")).toBe(true)`, и при
 * падении тест сказал бы «ожидалось true, получено false» вместо «кнопка не
 * заблокирована».
 *
 * Второе — уборка после каждого теста. В проекте `globals` выключены (импорты
 * из "vitest" явные), а `@testing-library/react` вешает уборку сам только там,
 * где `afterEach` лежит в глобальной области. Без неё разметка предыдущего
 * теста остаётся в документе, и `getByRole` находит две кнопки вместо одной.
 */
afterEach(() => {
  cleanup();
});

/**
 * Хранилище браузера в тестах.
 *
 * У свежих версий Node есть собственный глобальный `localStorage`, и без ключа
 * `--localstorage-file` он равен `undefined`. В окружении jsdom этот пустой
 * глобал перекрывает браузерный: `window.localStorage` тоже оказывается
 * пустым, и `persist` у zustand падает на первом же `setItem` — экран не
 * успевает даже отрисоваться.
 *
 * Поэтому кладём на его место своё хранилище в памяти. Оно даже удобнее
 * настоящего: живёт ровно один файл тестов и ничего не тащит из соседних.
 *
 * Ставим и в окружении node — там оно нужно ровно тем тестам, которые
 * импортируют настоящий стор (например, репозитории через подменённый порт).
 * `persist` у zustand умеет обойтись без хранилища, только когда обращение к
 * нему бросает исключение; пустой глобал Node он принимает за рабочий и падает
 * на первой же записи.
 */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, String(value)),
  };
}

if (!globalThis.localStorage) {
  Object.defineProperty(globalThis, "localStorage", {
    value: memoryStorage(),
    configurable: true,
  });
}
