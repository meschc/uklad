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
