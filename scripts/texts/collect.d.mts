/** Типы для теста выгрузки текстов (`src/lib/__tests__/textsExport.test.ts`). */
export interface Literal {
  text: string;
  start: number;
  end: number;
  line: number;
  quote: string;
}
export interface TextRow {
  sheet: "cabinet" | "site" | "raw";
  kind: "dict" | "copy" | "plural" | "raw" | "jsx" | "template";
  id: string;
  file: string;
  section: string;
  ru: Literal;
  en: Literal | null;
}
export const ROOT: string;
export function collect(): { rows: TextRow[]; skipped: string[] };
export function placeholders(s: string): string;
