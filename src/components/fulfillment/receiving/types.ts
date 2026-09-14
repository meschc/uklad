import type { Discrepancy, Product } from "@/lib/types";

/**
 * Шаг мастера переехал в доменные типы: с п.4.7 он сохраняется в сторе и
 * переживает перезагрузку, а стор не может зависеть от компонентов. Здесь
 * остаётся привычное короткое имя, чтобы шаги не пришлось переименовывать.
 */
export type { ReceivingStep as Step } from "@/lib/types";

/** Товар, опознанный сканом, до того как он записан в тару. */
export interface Draft {
  product: Product;
  /** Строка активной поставки, если товар из неё. */
  lineId?: string;
  qty: number;
  discrepancy?: Discrepancy;
}
