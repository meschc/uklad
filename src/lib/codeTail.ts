/**
 * Хвост кода — последние 4 знака, по которым человек сверяет скан с
 * этикеткой (Кирилл 16.11). Код показывается целиком, хвост в нём выделен:
 * одна функция на весь продукт, чтобы выделение везде было одинаковым.
 *
 * - Этикетка отправления, EAN, номер — последние 4 знака кода.
 * - Наш ярлык (`UK-BOX-28`, `UK-OUT-7KQ2ZD`) — последние 4 знака номера
 *   после последнего дефиса: префикс одинаков у всех, номер короче 4 — весь.
 * - DataMatrix «Честного знака» (`01<GTIN>21<серийный>…`) — последние 4
 *   знака серийного номера. Конец строки — криптохвост, человеку он ничего не
 *   говорит; он остаётся в коде, но не выделен (`rest`).
 */
export interface CodeParts {
  head: string;
  tail: string;
  /** Что идёт после хвоста: криптохвост DataMatrix. Обычно пусто. */
  rest: string;
}

const TAIL = 4;
const DATAMATRIX = /^(01\d{14}21)([A-Za-z0-9\-._/]{1,20})/;

export function splitCode(code: string): CodeParts {
  const dm = DATAMATRIX.exec(code);
  if (dm) {
    const end = dm[0].length;
    const cut = end - Math.min(TAIL, dm[2].length);
    return { head: code.slice(0, cut), tail: code.slice(cut, end), rest: code.slice(end) };
  }
  const dash = code.lastIndexOf("-");
  const last = dash >= 0 && dash < code.length - 1 ? code.length - dash - 1 : code.length;
  const cut = code.length - Math.min(TAIL, last);
  return { head: code.slice(0, cut), tail: code.slice(cut), rest: "" };
}

/**
 * Коды внутри готовой строки сообщения: «Тара UK-BOX-28 закреплена». Кодом
 * считаем наш ярлык (`UK-…`) и слово из латиницы и цифр, где цифр не меньше
 * шести (EAN, DataMatrix, номер отправления площадки). Артикулы вроде
 * `TS-001-BLK` и обычные слова не трогаем.
 */
const TOKEN = /(?<![A-Za-z0-9-])[A-Za-z0-9]+(?:[-_./][A-Za-z0-9]+)*(?![A-Za-z0-9])/g;

const isCodeToken = (s: string) =>
  /^UK-[A-Z]+-[A-Z0-9]/.test(s) || (s.match(/\d/g)?.length ?? 0) >= 6;

export function splitCodes(text: string): (string | { code: string })[] {
  const out: (string | { code: string })[] = [];
  let at = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (!isCodeToken(m[0])) continue;
    const i = m.index ?? 0;
    if (i > at) out.push(text.slice(at, i));
    out.push({ code: m[0] });
    at = i + m[0].length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}
