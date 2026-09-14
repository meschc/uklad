import { c, type Copy, type TFunc } from "./copy";
import type { SellerVolume } from "./estimate";

/**
 * Четыре числа оборота: как они называются и в чём измеряются.
 *
 * Список лежит отдельно от компонента, который его рисует
 * (`components/market/VolumeFields.tsx`), потому что подписи нужны и второму
 * читателю — письму заявки. Иначе письмо завело бы свои формулировки, и склад
 * читал бы «паллет», когда селлер вводил «паллето-мест».
 */

export interface VolumeField {
  key: keyof SellerVolume;
  label: Copy;
  unit: Copy;
  /** Подсказка в поле — число, одинаковое на обоих языках. */
  placeholder: string;
}

export const VOLUME_FIELDS: VolumeField[] = [
  {
    key: "places",
    label: c("Мест хранения", "Storage slots"),
    unit: c("паллето-мест", "pallet slots"),
    placeholder: "120",
  },
  {
    key: "boxes",
    label: c("Приёмка", "Intake"),
    unit: c("коробов в месяц", "boxes a month"),
    placeholder: "40",
  },
  {
    key: "orders",
    label: c("Сборка", "Picking"),
    unit: c("заказов в месяц", "orders a month"),
    placeholder: "900",
  },
  {
    key: "marking",
    label: c("Маркировка", "Labelling"),
    unit: c("единиц в месяц", "units a month"),
    placeholder: "0",
  },
];

/**
 * Объём одной строкой — для письма, которое уходит складу.
 *
 * Единицы пишутся те же, что стоят под полями: в письме они и объясняют число.
 * Незаполненное не печатается — ноль заказов в месяц это не «ноль», а
 * «не спрашивали».
 */
export function volumeText(t: TFunc, value: SellerVolume): string {
  return VOLUME_FIELDS.filter((f) => value[f.key] > 0)
    .map((f) => `${value[f.key]} ${t(f.unit)}`)
    .join(", ");
}
