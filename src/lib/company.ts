/**
 * Реквизиты компании по ИНН (п.4).
 *
 * Контрольная сумма ИНН считается по-настоящему — это чистая арифметика и она
 * ловит опечатку сразу, без сети. А вот сами реквизиты в прототипе брать
 * негде: справочник ФНС/DaData требует ключа и сервера, поэтому `lookupCompany`
 * — честная заглушка, помеченная флагом `mock`. Когда появится backend,
 * меняется только тело функции.
 */

const COEF_10 = [2, 4, 10, 3, 5, 9, 4, 6, 8];
const COEF_12_1 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
const COEF_12_2 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8];

function checkDigit(digits: number[], coefficients: number[]): number {
  const sum = coefficients.reduce((acc, k, i) => acc + k * digits[i], 0);
  return (sum % 11) % 10;
}

/** Валиден ли ИНН: 10 цифр (юрлицо) или 12 (ИП), с контрольными суммами. */
export function isValidInn(raw: string): boolean {
  const value = raw.replace(/\D/g, "");
  const digits = [...value].map(Number);
  if (value.length === 10) {
    return checkDigit(digits, COEF_10) === digits[9];
  }
  if (value.length === 12) {
    return (
      checkDigit(digits, COEF_12_1) === digits[10] && checkDigit(digits, COEF_12_2) === digits[11]
    );
  }
  return false;
}

export interface CompanyInfo {
  inn: string;
  name: string;
  kpp?: string;
  ogrn?: string;
  legalAddress?: string;
  /** true — данные не из справочника, а сгенерированы прототипом. */
  mock: boolean;
}

/**
 * «Подтянуть данные по ИНН». Пока backend нет — возвращает заглушку с тем же
 * ИНН и производными реквизитами, чтобы форма и экраны собирались на реальной
 * форме данных, а не на пустоте.
 */
export function lookupCompany(raw: string): CompanyInfo | null {
  const inn = raw.replace(/\D/g, "");
  if (!isValidInn(inn)) return null;
  const isSole = inn.length === 12;
  return {
    inn,
    name: isSole ? `ИП по ИНН ${inn}` : `ООО по ИНН ${inn}`,
    kpp: isSole ? undefined : `${inn.slice(0, 4)}01001`,
    ogrn: isSole ? `3${inn}${inn.slice(0, 2)}` : `1${inn}${inn.slice(0, 2)}`,
    legalAddress: "Уточните адрес — справочник ещё не подключён",
    mock: true,
  };
}

export interface BankInfo {
  bik: string;
  name: string;
  correspondentAccount?: string;
  /** true — данные не из справочника, а сгенерированы прототипом. */
  mock: boolean;
}

/**
 * «Банк по БИК» в демо без сервера: справочника нет, поэтому заглушка с
 * пометкой `mock`. Корсчёт собран по правилам ЦБ (30101810…, последние три
 * цифры — из БИК, ключ сходится), чтобы проверка счёта работала и в демо.
 */
export function lookupBank(raw: string): BankInfo | null {
  const bik = raw.replace(/\D/g, "");
  if (!/^04\d{7}$/.test(bik)) return null;
  const weights = [7, 1, 3];
  const tail = `00000000${bik.slice(-3)}`;
  const prefix = `0${bik.slice(4, 6)}30101810`;
  const keyless = [...`${prefix}0${tail}`];
  const sum = keyless.reduce((a, d, i) => a + ((Number(d) * weights[i % 3]) % 10), 0);
  // Ключ стоит девятым знаком счёта (12-м в строке с префиксом), вес у него 3.
  const key = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].find((k) => (sum + ((k * 3) % 10)) % 10 === 0) ?? 0;
  return {
    bik,
    name: `Банк по БИК ${bik}`,
    correspondentAccount: `30101810${key}${tail}`,
    mock: true,
  };
}
