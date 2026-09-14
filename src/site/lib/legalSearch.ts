import type { LegalBlock, LegalDoc } from "../data/legal/types";

/**
 * Поиск внутри правового документа.
 *
 * Документы длинные, и читают их не подряд: человек пришёл узнать срок
 * хранения данных и ищет слово «срок». Браузерный Ctrl+F это умеет, но
 * молчит о главном — в каком разделе нашлось. На телефоне его вообще нет
 * в привычном виде. Поэтому поиск свой: он подсвечивает совпадения **и**
 * показывает список разделов, где они есть, — из него сразу прыгают в нужный
 * пункт и ссылаются на него.
 *
 * Найденное не прячет непойденного: разделы без совпадений остаются на месте.
 * Отфильтрованный правовой документ — это документ, из которого молча вынули
 * половину, и человек не обязан догадываться, что видит не всё. По той же
 * причине печать не зависит от поиска: на бумагу уходит документ целиком.
 *
 * Ищем по самому документу — заголовкам разделов и их содержимому. Врезка
 * `lead` и строка основания `basis` — наша рамка вокруг документа, а не его
 * текст, и в счёт совпадений они не идут.
 *
 * Совпадение — точная подстрока, без склонений и синонимов. Морфология для
 * русского — это словарь на несколько мегабайт в бандле витрины; здесь она не
 * стоит своей цены, а человек и сам сокращает слово до основы. Об этом прямо
 * сказано в подсказке, когда не нашлось ничего, — чтобы поиск не выглядел
 * сломанным.
 */

/**
 * Короче двух знаков запрос ничего не сужает: одна буква найдётся в каждом
 * абзаце, и подсветка превратится в рябь по всей странице.
 */
export const MIN_QUERY = 2;

/** Кусок текста и то, попал ли он в запрос. Из таких кусков собирается абзац. */
export interface TextPart {
  text: string;
  hit: boolean;
}

/** Раздел, в котором что-то нашлось. */
export interface SectionHits {
  id: string;
  title: string;
  count: number;
}

export interface DocHits {
  /**
   * Запрос в том виде, в каком по нему ищут; пустая строка — не ищем.
   * Он же уходит в подсветку: сравнение идёт уже приведённым с обеих сторон.
   */
  query: string;
  /** Запрос набран, но короче `MIN_QUERY`: поиск ещё ждёт, а не «не нашлось». */
  tooShort: boolean;
  total: number;
  /** Только разделы с совпадениями, в порядке документа. */
  sections: SectionHits[];
}

/**
 * Приведение текста к виду, в котором сравнивают.
 *
 * Длина обязана сохраниться посимвольно: по смещениям в приведённой строке
 * подсветка режет **исходную**, и сдвиг на один знак увёл бы выделение вбок.
 * Поэтому регистр меняется только там, где это не меняет длину, а замены «ё»
 * на «е» и неразрывного пробела на обычный — один знак на один знак.
 *
 * «Ё» и неразрывный пробел здесь не прихоть: в документах стоит «счёт», а
 * набирают «счет»; между числом и единицей стоит неразрывный пробел, а в
 * запросе — обычный.
 */
function fold(text: string): string {
  let out = "";
  for (const ch of text) {
    const lower = ch.toLowerCase();
    out += lower.length === ch.length ? lower : ch;
  }
  // Во второй замене слева стоит неразрывный пробел (U+00A0), справа —
  // обычный. На глаз они неотличимы: если правка «лишнего пробела» их
  // сравняет, правило тихо выключится, а поиск начнёт терять совпадения.
  return out.split("ё").join("е").split(" ").join(" ");
}

/** Запрос, приведённый к виду сравнения. Пустой — искать нечего. */
export function normalizeQuery(raw: string): string {
  return fold(raw).trim();
}

/** Сколько раз запрос встречается в тексте. Совпадения не перекрываются. */
function countMatches(text: string, query: string): number {
  const hay = fold(text);
  let found = 0;
  let from = 0;
  for (;;) {
    const at = hay.indexOf(query, from);
    if (at === -1) return found;
    found += 1;
    from = at + query.length;
  }
}

/** Весь текст блока одним списком — блоку всё равно, кто его читает. */
function blockTexts(block: LegalBlock): string[] {
  switch (block.kind) {
    case "p":
    case "note":
      return [block.text];
    case "list":
    case "ordered":
      return block.items;
    case "table":
      return [...block.head, ...block.rows.flat()];
  }
}

/**
 * Разбор абзаца на куски: что подсветить, что оставить как есть.
 *
 * Возвращаются куски **исходного** текста — регистр и «ё» в документе остаются
 * документными, приведение живёт только внутри сравнения.
 */
export function splitMatches(text: string, query: string): TextPart[] {
  if (query === "") return [{ text, hit: false }];

  const hay = fold(text);
  const parts: TextPart[] = [];
  let from = 0;

  for (;;) {
    const at = hay.indexOf(query, from);
    if (at === -1) break;
    if (at > from) parts.push({ text: text.slice(from, at), hit: false });
    parts.push({ text: text.slice(at, at + query.length), hit: true });
    from = at + query.length;
  }

  if (from < text.length) parts.push({ text: text.slice(from), hit: false });
  return parts;
}

/** Где в документе встречается запрос и сколько раз. */
export function searchDoc(doc: LegalDoc, raw: string): DocHits {
  const query = normalizeQuery(raw);
  if (query.length < MIN_QUERY) {
    return { query: "", tooShort: query.length > 0, total: 0, sections: [] };
  }

  const sections: SectionHits[] = [];
  let total = 0;

  for (const section of doc.sections) {
    const texts = [section.title, ...section.blocks.flatMap(blockTexts)];
    const count = texts.reduce((sum, text) => sum + countMatches(text, query), 0);
    if (count > 0) sections.push({ id: section.id, title: section.title, count });
    total += count;
  }

  return { query, tooShort: false, total, sections };
}
