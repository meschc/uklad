/**
 * Погруженное на столе до «Машина уехала» (Кирилл 27.11, отмена своего скана
 * на погрузке). Рейс ещё не ушёл, сервер о сканах не знает, поэтому отмена
 * правит только этот список. Скан бывает групповым: последнее грузовое место
 * отгрузки досылает в машину все её посылки (`ShipStation`), поэтому шаг
 * помнит всё, что он добавил, и отмена снимает его целиком.
 */
export interface Loaded {
  units: string[];
  /** Что добавил каждый скан — по порядку. */
  steps: string[][];
}

export const EMPTY_LOADED: Loaded = { units: [], steps: [] };

/** Скан принят: дописать новые коды одним шагом. Уже погруженные не дублируются. */
export function addLoaded(l: Loaded, codes: readonly string[]): Loaded {
  const fresh = [...new Set(codes)].filter((c) => !l.units.includes(c));
  if (fresh.length === 0) return l;
  return { units: [...l.units, ...fresh], steps: [...l.steps, fresh] };
}

/** Снять последний скан: всё, что он добавил. */
export function undoLoaded(l: Loaded): Loaded {
  const last = l.steps.at(-1);
  if (!last) return l;
  return { units: l.units.filter((c) => !last.includes(c)), steps: l.steps.slice(0, -1) };
}
