/**
 * Разбор кода маркировки «Честного знака» по правилам GS1 DataMatrix.
 *
 * Код — это цепочка «идентификатор применения (AI) + значение»: `01` GTIN
 * (14 цифр), `21` серийный номер, `91`/`92` ключ и криптоподпись, `93` короткий
 * криптохвост (молоко, вода и др.). Поля переменной длины заканчиваются
 * разделителем GS (символ 29). Сканер в режиме HID его часто теряет или
 * печатает иначе, поэтому разбор терпит настоящий GS и текстовые `<GS>` /
 * `\x1d`; без разделителя серийник режется по типовой длине группы.
 *
 * Проверку в ГИС МТ этот модуль не делает: он отвечает на вопрос «похоже ли
 * это на код и какие в нём поля», а «действителен ли код» — вопрос сервера
 * (`connectors/honestSign.ts`).
 */

/** Разделитель полей переменной длины в GS1. */
export const GS = "\u001d";

/** Максимальная длина сырого кода, которую вообще принимаем к разбору. */
const MAX_RAW = 256;

export interface MarkingCode {
  /** GTIN из 14 цифр. */
  gtin: string;
  /** Серийный номер экземпляра. */
  serial: string;
  /** Ключ проверки (AI 91), если есть. */
  verifyKey?: string;
  /** Криптоподпись (AI 92) или короткий криптохвост (AI 93). */
  crypto?: string;
  /** Под каким AI пришёл криптохвост: в полной строке он должен остаться тем же. */
  cryptoAi?: "92" | "93";
  /**
   * Код идентификации без криптохвоста: GTIN + серийник. Его можно
   * показывать, печатать в документах и передавать маркетплейсу.
   */
  cis: string;
  /** Полная строка с GS-разделителями — уходит только на сервер. */
  full: string;
  /** Контрольная цифра GTIN сошлась. */
  gtinValid: boolean;
}

/** Привести запись разделителя со сканера к настоящему GS и убрать мусор. */
export function normalizeMarkingRaw(raw: string): string {
  return (
    raw
      .slice(0, MAX_RAW)
      .replace(/<GS>|\\x1d|\\u001d/gi, GS)
      // Управляющие символы, кроме самого GS, со сканера приходить не должны.
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1c\x1e-\x1f\x7f]/g, "")
      .replace(/^\]d2/, "") // префикс символики DataMatrix у части сканеров
      .trim()
  );
}

/** Контрольная цифра GTIN/EAN по модулю 10. */
export function isValidGtin(gtin: string): boolean {
  if (!/^\d{8,14}$/.test(gtin)) return false;
  const digits = gtin.split("").map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/**
 * Длина серийного номера, если GS потерян. Большинство групп (обувь, одежда,
 * шины, духи) — 13, молочная продукция и вода — 6, табак — 7. Берём ту длину,
 * после которой идёт `91` или `93`.
 */
const SERIAL_LENGTHS = [13, 6, 7];

/** Разобрать код. `undefined` — строка не похожа на код маркировки. */
export function parseMarkingCode(raw: string): MarkingCode | undefined {
  const s = normalizeMarkingRaw(raw);
  const head = /^01(\d{14})21/.exec(s);
  if (!head) return undefined;
  const gtin = head[1];
  const rest = s.slice(head[0].length);

  let serial: string;
  let tail: string;
  const gsAt = rest.indexOf(GS);
  if (gsAt >= 0) {
    serial = rest.slice(0, gsAt);
    tail = rest.slice(gsAt);
  } else {
    const len = SERIAL_LENGTHS.find((n) => /^(91|93)/.test(rest.slice(n)));
    serial = len === undefined ? rest : rest.slice(0, len);
    tail = len === undefined ? "" : GS + rest.slice(len);
  }
  if (!serial || serial.length > 20) return undefined;

  let verifyKey: string | undefined;
  let crypto: string | undefined;
  let cryptoAi: "92" | "93" | undefined;
  for (const f of tail.split(GS).filter(Boolean)) {
    // Без GS ключ 91 (4 знака) и подпись 92 идут слитно.
    const glued = /^91(.{4})92(.+)$/.exec(f);
    if (glued) {
      verifyKey = glued[1];
      crypto = glued[2];
      cryptoAi = "92";
    } else if (f.startsWith("91")) verifyKey = f.slice(2);
    else if (f.startsWith("92") || f.startsWith("93")) {
      crypto = f.slice(2);
      cryptoAi = f.slice(0, 2) as "92" | "93";
    }
  }

  const cis = `01${gtin}21${serial}`;
  const full = [cis, verifyKey && `91${verifyKey}`, crypto && `${cryptoAi}${crypto}`]
    .filter(Boolean)
    .join(GS);
  return {
    gtin,
    serial,
    verifyKey,
    crypto,
    cryptoAi,
    cis,
    full,
    gtinValid: isValidGtin(gtin),
  };
}

/** Код для экрана: GTIN и серийник целиком, криптохвост не показываем. */
export function maskMarkingCode(code: MarkingCode): string {
  return code.crypto ? `${code.cis} •••` : code.cis;
}
