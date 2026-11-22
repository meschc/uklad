import { useEffect, useRef, useState } from "react";
import type { Result } from "./data";
import type { MsgKey } from "./i18n";

/**
 * Состояние одной команды к слою данных: «идёт» и «не вышло» (п.3.2.2).
 *
 * Заводится хуком, а не парой `useState` в каждом обработчике, по той же
 * причине, по которой заведён `Result`: когда за репозиторием появится сеть,
 * ожидание и отказ понадобятся всем экранам сразу. Пятнадцать копий одной
 * пары состояний разъедутся — где-то забудут снять «идёт», где-то не покажут
 * ошибку.
 *
 * `run` отдаёт тот же `Result`, что и репозиторий: экран сам решает, что
 * делать дальше — закрыть диалог только при успехе, оставить открытым при
 * отказе, чтобы кнопка стала повтором.
 */
export interface Command<A extends unknown[], T> {
  run: (...args: A) => Promise<Result<T>>;
  pending: boolean;
  error: MsgKey | null;
  reset: () => void;
}

export interface CommandOptions {
  /**
   * Пока команда идёт, повторный запуск не шлёт второй запрос, а ждёт первый.
   * Для действий, где второй раз — вред, а не повтор: выпуск бейджа гасит
   * предыдущий, и двойной клик раньше, чем кнопка успела стать неактивной,
   * отправлял два выпуска — на экране мог остаться уже погашенный код.
   * Не для сканов: там каждый вызов — своя штука.
   */
  exclusive?: boolean;
}

export function useCommand<A extends unknown[], T>(
  action: (...args: A) => Promise<Result<T>>,
  { exclusive = false }: CommandOptions = {},
): Command<A, T> {
  const [pending, setPending] = useState(false);
  const inFlight = useRef<Promise<Result<T>> | null>(null);
  const [error, setError] = useState<MsgKey | null>(null);

  // Ответ может прийти после того, как диалог закрыли: запись состояния в
  // размонтированный компонент ничего не чинит и мусорит в консоль. Флаг
  // поднимается на каждом монтировании — иначе двойной прогон эффектов в
  // StrictMode оставил бы хук навсегда «мёртвым».
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const start = async (...args: A): Promise<Result<T>> => {
    setPending(true);
    setError(null);
    try {
      const res = await action(...args);
      if (alive.current) {
        setPending(false);
        setError(res.ok ? null : res.error);
      }
      return res;
    } finally {
      inFlight.current = null;
    }
  };

  const run = (...args: A): Promise<Result<T>> => {
    if (exclusive && inFlight.current) return inFlight.current;
    const p = start(...args);
    if (exclusive) inFlight.current = p;
    return p;
  };

  return { run, pending, error, reset: () => setError(null) };
}
