import type { LabelCodeType, LabelElement, LabelLayout } from "./types";

/**
 * Раскладка наклейки в миллиметрах. Чистая функция, а не вёрстка внутри
 * компонента: что поместится на ленте 43×25 и что нет, проверяется тестом, а
 * не глазами на пробной печати.
 *
 * Правила (по разбору ярлыков 31.10.2026):
 *  - поля фиксированные и малые, а не процент ленты;
 *  - код занимает всю короткую сторону: вертикально — ширину, горизонтально —
 *    высоту. Он самое важное на ярлыке, остальное делит остаток;
 *  - номер под кодом крупный: при порванном QR его набирают руками, а префикс
 *    «UK-BOX» мелкий — он у всех одинаковый;
 *  - остаток распределяется по краям (номер сверху, служебное снизу), а не
 *    сбивается в кучу; что не помещается, скрывается, а не обрезается.
 */

export interface LabelPlanInput {
  widthMm: number;
  heightMm: number;
  layout: LabelLayout;
  codeType: LabelCodeType;
  elements: readonly LabelElement[];
  /** Сколько цифр в большом номере: от этого зависит его кегль. */
  digits: number;
  /** Дополнительные строки (рабочее место: товар, заказ). */
  extraLines?: number;
  /** Крупная подпись над номером (получатель на этикетке отправления). */
  headline?: boolean;
  /** Длина самого длинного слова подписи: слово не рвём, а уменьшаем кегль. */
  headlineWord?: number;
}

export interface LabelPlan {
  horizontal: boolean;
  padMm: number;
  gapMm: number;
  /** Блок кода. */
  code: { w: number; h: number };
  /** Остаток рядом с кодом. */
  rest: { w: number; h: number };
  /** Кегль мелкого текста и номера, мм. */
  smallMm: number;
  numberMm: number;
  headlineMm: number;
  prefixMm: number;
  /** Сколько информационных строк помещается (склад, свои строки, примечание, КИЗ — по порядку). */
  infoCount: number;
  show: {
    headline: boolean;
    header: boolean;
    number: boolean;
    footer: boolean;
    seq: boolean;
    date: boolean;
    fragile: boolean;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const LINE = 1.25;

export function planLabel(i: LabelPlanInput): LabelPlan {
  const has = (e: LabelElement) => i.elements.includes(e);
  // Ориентацию решают стороны, а не поле шаблона: старые шаблоны хранят
  // «вертикально» при ленте 58×40, и код тогда сжимался до трети ширины.
  const horizontal =
    i.widthMm > i.heightMm || (i.widthMm === i.heightMm && i.layout === "horizontal");
  const minSide = Math.min(i.widthMm, i.heightMm);
  const padMm = clamp(minSide * 0.03, 1, 2.5);
  const gapMm = padMm;
  const innerW = i.widthMm - padMm * 2;
  const innerH = i.heightMm - padMm * 2;
  const smallMm = clamp(minSide * 0.07, 1.8, 6);

  // Блок кода. QR квадратный; линейный код вытянут и не отнимает у текста
  // больше, чем нужно для уверенного чтения.
  let code: { w: number; h: number };
  if (i.codeType === "qr") {
    const side = horizontal ? Math.min(innerH, innerW * 0.62) : Math.min(innerW, innerH * 0.68);
    code = { w: side, h: side };
  } else if (horizontal) {
    code = { w: innerW * 0.5, h: innerH };
  } else {
    code = { w: innerW, h: Math.min(innerH * 0.4, innerW * 0.5) };
  }

  const rest = horizontal
    ? { w: innerW - code.w - gapMm, h: innerH }
    : { w: innerW, h: innerH - code.h - gapMm };

  const small = smallMm * LINE;
  const number = has("code");
  // Вертикально мелкий префикс стоит сбоку от номера и отнимает ширину; горизонтально он над номером.
  const widthPerMm = Math.max(i.digits, 1) * 0.62 + (horizontal ? 0 : 0.33);
  const numberMm = number
    ? clamp(
        Math.min(rest.h * (i.headline ? 0.3 : 0.42), (rest.w - (horizontal ? 0 : 1)) / widthPerMm),
        smallMm,
        26,
      )
    : 0;
  const prefixMm = Math.max(1.5, numberMm * 0.3);

  // Что помещается в остаток. Номер важнее всего, потом служебная строка,
  // потом информация; шапка (логотип, заголовок) — только на крупной ленте.
  let free = rest.h - (number ? numberMm * 1.05 + (horizontal ? prefixMm * 1.1 : 0) : 0);
  const gap = smallMm * 0.5;
  const take = (need: number) => {
    if (free >= need + gap) {
      free -= need + gap;
      return true;
    }
    return false;
  };

  // Кегль подписи — такой, чтобы самое длинное слово встало в строку целиком:
  // «Констан-тинова» с переносом посреди слова читается хуже мелкого шрифта.
  const headlineMm = clamp(
    Math.min(smallMm * 1.6, rest.w / (Math.max(i.headlineWord ?? 1, 1) * 0.6)),
    1.6,
    smallMm * 1.6,
  );
  const headline = !!i.headline && take(headlineMm * 1.1 * 2);

  // Нижняя строка — три колонки, как в макете Кирилла (02.11): номер места
  // дробью слева, «Хрупкое» по центру, дата в две строки справа. Важность:
  // «Хрупкое» > номер места > дата; что не влезает по ширине, пропадает целиком.
  const candidates: { key: "fragile" | "seq" | "date"; w: number }[] = [];
  if (has("fragile")) candidates.push({ key: "fragile", w: smallMm * 7 });
  if (has("seq")) candidates.push({ key: "seq", w: smallMm * 3.2 });
  if (has("date")) candidates.push({ key: "date", w: smallMm * 3.2 });
  const rowH = smallMm * (has("date") ? 2.2 : 1.6);
  const width = (items: { w: number }[]) =>
    items.reduce((sum, it) => sum + it.w, 0) + smallMm * Math.max(0, items.length - 1);
  let kept = candidates;
  while (kept.length > 0 && (width(kept) > rest.w || rowH + gap > free)) kept = kept.slice(0, -1);
  if (kept.length > 0) free -= rowH + gap;
  const footer = kept.length > 0;
  const infoLines =
    (has("warehouse") ? 1 : 0) +
    (has("note") ? 1 : 0) +
    (i.extraLines ?? 0) +
    (has("mark") ? 1 : 0);
  let shownInfo = 0;
  for (let n = 0; n < infoLines; n++) if (take(small * 0.9)) shownInfo++;
  const header = (has("logo") || has("title")) && minSide >= 80 && take(small * 1.4);

  return {
    horizontal,
    padMm,
    gapMm,
    code,
    rest,
    smallMm,
    numberMm,
    headlineMm,
    prefixMm,
    infoCount: shownInfo,
    show: {
      headline,
      header,
      number,
      footer,
      seq: kept.some((k) => k.key === "seq"),
      date: kept.some((k) => k.key === "date"),
      fragile: kept.some((k) => k.key === "fragile"),
    },
  };
}

/** Делит код на мелкий префикс и крупный номер: «UK-BOX-1234» → «UK-BOX», «1234». */
export function splitCode(code: string): { prefix: string; number: string } {
  const at = code.lastIndexOf("-");
  if (at <= 0 || at === code.length - 1) return { prefix: "", number: code };
  return { prefix: code.slice(0, at), number: code.slice(at + 1) };
}
