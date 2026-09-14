import type { TFunc } from "@/lib/i18n";

/**
 * Числительные инспектора. Живут отдельно от разметки: их зовут из четырёх
 * панелей, и совпадать формы должны везде.
 */

/** Слова «ячейка/ячейки/ячеек» / «cell/cells». */
export function cellsWord(t: TFunc, n: number): string {
  return t.plural(n, ["ячейка", "ячейки", "ячеек"], ["cell", "cells"]);
}

/** Дательное «секции/секциям» / «section/sections» — для «Применить к N». */
export function sectionsWord(t: TFunc, n: number): string {
  return t.plural(n, ["секции", "секциям", "секциям"], ["section", "sections"]);
}
