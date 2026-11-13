/**
 * Свой цвет и свой звук у каждого назначения (склад площадки, ПВЗ, магазин).
 *
 * Упаковщик и грузчик смотрят на коробку, а не в текст адреса: «оранжевый,
 * два высоких» опознаётся быстрее, чем «Склад WB Коледино». Цвет и звук
 * выводятся из названия назначения хешем — одинаковы на всех столах и после
 * перезагрузки, ничего настраивать не нужно. Палитра — метки метро из
 * дизайн-системы (`--tag-*` в `index.css`); на светлых тонах текст тёмный.
 */
interface DestinationMark {
  /** CSS-переменная цвета (HSL без `hsl()`). */
  token: string;
  /** Тёмный текст: на жёлтом, салатовом и оранжевом белый не читается. */
  darkInk: boolean;
  /** Две ноты подтверждения, Гц. */
  notes: [number, number];
}

const MARKS: DestinationMark[] = [
  { token: "--tag-plan", darkInk: false, notes: [880, 1175] },
  { token: "--tag-fulfillment", darkInk: true, notes: [988, 1319] },
  { token: "--tag-staff", darkInk: false, notes: [784, 1047] },
  { token: "--tag-integrations", darkInk: false, notes: [1047, 1397] },
  { token: "--tag-market", darkInk: true, notes: [698, 932] },
  { token: "--tag-platform", darkInk: false, notes: [1175, 880] },
  { token: "--tag-warehouses", darkInk: false, notes: [1319, 988] },
  { token: "--tag-sellers", darkInk: true, notes: [932, 1245] },
  { token: "--tag-bug", darkInk: false, notes: [1047, 784] },
];

export function destinationMark(destination: string): DestinationMark {
  let h = 2166136261;
  for (const ch of destination.trim().toLowerCase()) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return MARKS[(h >>> 0) % MARKS.length];
}
