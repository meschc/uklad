import { LIMITS } from "./numberLimits";

/**
 * Цена в рублях так, как её пишут в России (Кирилл 22.11): тысячи через
 * пробел, копейки через запятую, не больше двух знаков после запятой и не
 * больше 99 999,99. Поле текстовое: у `type="number"` нет пробелов между
 * тысячами, а набрать можно сколько угодно знаков после запятой.
 */
export function formatPrice(raw: string): string {
  const clean = raw.replace(/\./g, ",").replace(/[^\d,]/g, "");
  const [int = "", ...rest] = clean.split(",");
  const whole = int
    .replace(/^0+(?=\d)/, "")
    .slice(0, 5)
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return clean.includes(",") ? `${whole || "0"},${rest.join("").slice(0, 2)}` : whole;
}

/** Строка поля → число; пусто — цены нет. */
export function parsePrice(text: string): number | null {
  const raw = text.replace(/\s/g, "").replace(",", ".");
  if (raw === "" || raw === ".") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(LIMITS.price.max, Math.max(0, n)) : null;
}
