/**
 * Пароли, которые подбирают первыми (обход безопасности 23.11, точка 12:
 * credential stuffing). Длина у кабинета — от 10 символов, поэтому здесь
 * только то, что этот порог проходит: частые пароли из утёкших баз, ряды
 * клавиатуры (латиница и та же раскладка по-русски), счёт подряд и один
 * символ много раз. Сравниваем без регистра и пробелов по краям.
 */
/* global module */

const LIST = [
  "1234567890",
  "0987654321",
  "12345678910",
  "123456789a",
  "a123456789",
  "1234567890a",
  "123456789q",
  "q123456789",
  "1234567891",
  "1234554321",
  "1122334455",
  "1qaz2wsx3edc",
  "1q2w3e4r5t",
  "1q2w3e4r5t6y",
  "q1w2e3r4t5",
  "q1w2e3r4t5y6",
  "zaq12wsxcde3",
  "zaq1xsw2cde3",
  "qwertyuiop",
  "qwerty1234",
  "qwerty12345",
  "qwerty123456",
  "qwertyuiop123",
  "asdfghjkl;",
  "asdfghjkl1",
  "zxcvbnm123",
  "zxcvbnm1234",
  "password12",
  "password123",
  "password1234",
  "passw0rd123",
  "p@ssw0rd123",
  "password!1",
  "administrator",
  "admin12345",
  "admin123456",
  "iloveyou12",
  "iloveyou123",
  "princess12",
  "football12",
  "baseball12",
  "superman12",
  "1qazxsw23edc",
  "abcdefghij",
  "abcd123456",
  "abc1234567",
  "abcdef1234",
  "qwer123456",
  "asdf123456",
  "letmein123",
  "welcome123",
  "sunshine12",
  "computer12",
  "internet12",
  "monkey1234",
  "dragon1234",
  "master1234",
  "michael123",
  "1234qwerty",
  "123qweasdzxc",
  "qweasdzxc123",
  "qazwsxedc123",
  "qazwsxedcrfv",
  "1q2w3e4r5t6y7u",
  "йцукенгшщз",
  "йцукенгшщзхъ",
  "фывапролдж",
  "ячсмитьбю",
  "пароль1234",
  "пароль12345",
  "парольпароль",
  "qwertyqwerty",
  "passwordpassword",
  "uklad12345",
  "uklad123456",
  "ukladuklad",
  "sklad12345",
  "sklad123456",
  "склад12345",
  "уклад12345",
  "marketplace",
  "wildberries",
  "wildberries1",
  "ozon123456",
  "123123123123",
  "1231231231",
  "1212121212",
  "1111122222",
  "0000011111",
  "9876543210",
  "147258369a",
  "1472583690",
  "159753456852",
];

const COMMON = new Set(LIST);

/** Строка — подряд идущие символы (0123…, abcd…, 9876…). */
function isRun(s) {
  if (s.length < 3) return false;
  const step = s.charCodeAt(1) - s.charCodeAt(0);
  if (Math.abs(step) !== 1) return false;
  for (let i = 2; i < s.length; i++) {
    if (s.charCodeAt(i) - s.charCodeAt(i - 1) !== step) return false;
  }
  return true;
}

/** Пароль из тех, что подбирают первыми. */
function isCommonPassword(password) {
  const p = String(password).trim().toLowerCase();
  if (COMMON.has(p)) return true;
  // Один символ много раз или короткий кусок, повторённый до длины: «aaaa…», «abcabc…».
  for (let n = 1; n <= 4; n++) {
    if (p.length % n === 0 && p.slice(0, n).repeat(p.length / n) === p) return true;
  }
  return isRun(p);
}

module.exports = { isCommonPassword };
