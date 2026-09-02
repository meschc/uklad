/**
 * Правовые документы держим данными, а не размёткой.
 *
 * Их семь, они длинные и их правят юристы, а не верстальщики. Если каждый
 * документ — это JSX, то любая правка формулировки означает правку компонента,
 * и рано или поздно в одном документе абзацы будут выглядеть иначе, чем в
 * соседнем. Здесь же типографика описана один раз в рендерере, а текст
 * остаётся текстом — из него бесплатно собирается оглавление и якоря.
 */
export type LegalBlock =
  | { kind: "p"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "ordered"; items: string[] }
  /** Выделенная врезка: то, что человек должен заметить, даже пролистывая. */
  | { kind: "note"; text: string }
  | { kind: "table"; head: string[]; rows: string[][] };

export interface LegalSection {
  /** Якорь для оглавления. Латиницей — кириллица в адресной строке нечитаема. */
  id: string;
  title: string;
  blocks: LegalBlock[];
}

export interface LegalDoc {
  /** Код документа в адресе: `#/legal/privacy`. */
  slug: string;
  /** Заголовок документа целиком. */
  title: string;
  /** Короткое имя для меню и подвала. */
  short: string;
  /** Одно предложение о том, зачем документ нужен читателю. */
  lead: string;
  /** Норма, из которой документ растёт, — печатается под заголовком. */
  basis: string;
  sections: LegalSection[];
}

/** Короткие конструкторы: без них файлы документов тонут в `kind:`. */
export const p = (text: string): LegalBlock => ({ kind: "p", text });
export const list = (...items: string[]): LegalBlock => ({ kind: "list", items });
export const ordered = (...items: string[]): LegalBlock => ({ kind: "ordered", items });
export const note = (text: string): LegalBlock => ({ kind: "note", text });
export const table = (head: string[], rows: string[][]): LegalBlock => ({
  kind: "table",
  head,
  rows,
});
