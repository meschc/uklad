import { readSheetMatrix } from "./sheets";
import { BOM } from "./utils";
import type { MsgKey } from "./i18n";

/**
 * Файл импорта → матрица `string[][]` (ТЗ, разд. 2.5: «импорт Excel/1С»).
 *
 * Два входа: настоящая книга .xlsx через SheetJS и CSV/TSV (вставка текстом,
 * выгрузка 1С). Оба сводятся к матрице, а что в какой колонке — решает уже
 * сопоставление колонок (`importProducts`). Здесь живёт один алерт ТЗ
 * (разд. 4): ошибка формата файла.
 *
 * Саму книгу читает `lib/sheets`: SheetJS грузится по требованию, поэтому
 * разбор файла асинхронный, а разбор текста — нет.
 */

/** Строк в одном файле: больше — предпросмотр и один запрос к серверу не потянут. */
export const MAX_IMPORT_ROWS = 10_000;
/** Размер файла, байт: книга на 50 000 строк весит больше и до разбора не доходит. */
export const MAX_IMPORT_BYTES = 8 * 1024 * 1024;

export type MatrixResult =
  | { ok: true; matrix: string[][] }
  | { ok: false; kind: "empty" }
  | { ok: false; kind: "format"; reasonKey: MsgKey };

const formatError = (reasonKey: MsgKey): MatrixResult => ({ ok: false, kind: "format", reasonKey });

function detectDelim(line: string): string | null {
  let best: string | null = null;
  let bestN = 0;
  for (const d of ["\t", ";", ","]) {
    const n = line.split(d).length - 1;
    if (n > bestN) {
      bestN = n;
      best = d;
    }
  }
  return best;
}

/**
 * Разбор строки CSV. Кавычка — спецсимвол только в начале поля (как в Excel);
 * кавычка в середине значения (напр. `Планшет 11"`) — обычный символ.
 */
function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  let atStart = true;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"' && atStart) {
      quoted = true;
      atStart = false;
    } else if (ch === delim) {
      out.push(cur);
      cur = "";
      atStart = true;
    } else {
      cur += ch;
      atStart = false;
    }
  }
  out.push(cur);
  return out;
}

/** Похоже ли на бинарный/не-текстовый ввод (вставленный .xlsx и т.п.). */
function looksBinary(s: string): boolean {
  if (s.startsWith("PK")) return true; // zip-сигнатура .xlsx
  const probe = s.slice(0, 4000);
  for (let i = 0; i < probe.length; i++) {
    const c = probe.charCodeAt(i);
    // управляющие символы, кроме таб/CR/LF
    if (c < 9 || (c > 13 && c < 32)) return true;
  }
  return false;
}

/**
 * Байты CSV → текст. Выгрузка 1С и старого Excel — windows-1251: прочитанная
 * как UTF-8, она превращается в «����» и все колонки не узнаются. Строгий
 * UTF-8 не прошёл — читаем как 1251.
 */
export function decodeImportText(buf: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1251").decode(buf);
  }
}

/** Матрица без пустых строк, ячейки без пробелов по краям. */
function checked(matrix: string[][]): MatrixResult {
  const rows = matrix
    .map((r) => r.map((c) => String(c ?? "").trim()))
    .filter((r) => r.some((c) => c !== ""));
  if (rows.length < 2) return formatError("import.msg.needTwoLines");
  // Запас на строки шапки над заголовком: их отрежет поиск заголовка.
  if (rows.length - 1 > MAX_IMPORT_ROWS + 20) return formatError("import.msg.tooMany");
  return { ok: true, matrix: rows };
}

/** CSV/TSV-текст (вставка / выгрузка 1С) → матрица. */
export function textToMatrix(text: string): MatrixResult {
  // Выгрузка из 1С и Excel начинается с BOM — срезаем, иначе первая колонка
  // заголовка не совпадёт ни с одним ожидаемым именем.
  const clean = (text.startsWith(BOM) ? text.slice(BOM.length) : text).trim();
  if (!clean) return { ok: false, kind: "empty" };
  if (looksBinary(clean)) return formatError("import.msg.binary");

  const lines = clean.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return formatError("import.msg.needTwoLines");
  // Разделитель — по первой строке, где он есть: у выгрузки 1С сверху бывает
  // шапка отчёта одной ячейкой, без разделителей.
  const delim = lines
    .slice(0, 20)
    .map(detectDelim)
    .find((d) => d !== null);
  if (!delim) return formatError("import.msg.noDelimiter");
  return checked(lines.map((l) => splitLine(l, delim)));
}

/** Бинарная книга .xlsx/.xls через SheetJS → матрица. */
export async function fileToMatrix(buf: ArrayBuffer): Promise<MatrixResult> {
  let matrix: string[][] | null;
  try {
    matrix = await readSheetMatrix(buf);
  } catch {
    // Сюда попадают и битый файл, и недоступная библиотека. Разделять их в
    // сообщении не за чем: обе беды человек чинит одним и тем же — повторить
    // или выгрузить CSV, а второй путь работает и без SheetJS.
    return formatError("import.msg.unreadable");
  }
  if (!matrix) return formatError("import.msg.noSheet");
  return checked(matrix);
}
