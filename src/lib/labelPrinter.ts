import { useSyncExternalStore } from "react";
import { readLocal, writeLocal } from "./safeStorage";

/**
 * Принтер этикеток рабочего места. Браузер не умеет ни выбрать принтер за
 * человека, ни узнать, какие они есть: выбор делается в окне печати самой
 * системы. Поэтому здесь хранится только то, что браузеру можно сообщить:
 * как принтер называется (подсказка оператору, что выбрать в окне), какой
 * размер ленты стоит (он уходит в `@page`, и окно печати предлагает ту же
 * бумагу). Тихая печать без окна требует Chrome с флагом `--kiosk-printing`
 * (печатает на принтер системы по умолчанию) либо локального агента.
 *
 * Принтер привязан к компьютеру, а не к компании, поэтому настройка лежит в
 * localStorage браузера, а не в сторе кабинета: на другом столе стоит другой
 * принтер, и в серверный снимок компании это не едет.
 */

export interface LabelPrinter {
  /** Как принтер называется в системе. Только подсказка, браузер его не проверяет. */
  name: string;
  widthMm: number;
  heightMm: number;
}

export const LABEL_SIZES: { widthMm: number; heightMm: number }[] = [
  { widthMm: 43, heightMm: 25 },
  { widthMm: 58, heightMm: 40 },
  { widthMm: 75, heightMm: 120 },
  { widthMm: 100, heightMm: 150 },
];

export const DEFAULT_LABEL_PRINTER: LabelPrinter = { name: "", widthMm: 58, heightMm: 40 };

const KEY = "uklad-label-printer-v1";
const MAX_NAME = 60;
const MIN_MM = 20;
const MAX_MM = 200;

/** Разбор сохранённого значения: битое или чужое не должно ломать печать. */
export function parseLabelPrinter(raw: string | null): LabelPrinter {
  if (!raw) return DEFAULT_LABEL_PRINTER;
  try {
    const v = JSON.parse(raw) as Partial<LabelPrinter> | null;
    if (!v || typeof v !== "object") return DEFAULT_LABEL_PRINTER;
    return normalizeLabelPrinter(v);
  } catch {
    return DEFAULT_LABEL_PRINTER;
  }
}

/** Привести к допустимому виду: размер в разумных миллиметрах, имя без лишнего. */
export function normalizeLabelPrinter(v: Partial<LabelPrinter>): LabelPrinter {
  const mm = (x: unknown, fallback: number) =>
    typeof x === "number" && Number.isFinite(x)
      ? Math.min(MAX_MM, Math.max(MIN_MM, Math.round(x)))
      : fallback;
  return {
    name: typeof v.name === "string" ? v.name.trim().slice(0, MAX_NAME) : "",
    widthMm: mm(v.widthMm, DEFAULT_LABEL_PRINTER.widthMm),
    heightMm: mm(v.heightMm, DEFAULT_LABEL_PRINTER.heightMm),
  };
}

/** Размер ленты в виде «58×40» — одинаково везде, где его показываем. */
export function sizeLabel(p: Pick<LabelPrinter, "widthMm" | "heightMm">): string {
  return `${p.widthMm}×${p.heightMm}`;
}

// Подписка на одну переменную: все экраны стола видят правку сразу, а
// `useSyncExternalStore` просит стабильную ссылку — держим разобранное значение.
const listeners = new Set<() => void>();
let cached: LabelPrinter | null = null;

function read(): LabelPrinter {
  if (!cached) cached = parseLabelPrinter(readLocal(KEY));
  return cached;
}

export function saveLabelPrinter(next: Partial<LabelPrinter>): LabelPrinter {
  cached = normalizeLabelPrinter({ ...read(), ...next });
  writeLocal(KEY, JSON.stringify(cached));
  listeners.forEach((l) => l());
  return cached;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useLabelPrinter(): LabelPrinter {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_LABEL_PRINTER);
}
