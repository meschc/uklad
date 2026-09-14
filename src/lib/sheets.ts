/**
 * Книги Excel: чтение листа и выгрузка шаблона.
 *
 * Библиотека SheetJS весит больше, чем всё остальное приложение вместе взятое,
 * а нужна она в четырёх местах, до которых доходит меньшинство: импорт
 * номенклатуры, выгрузка трёх шаблонов и разбор файла поставки. Пока она
 * значилась обычным импортом, её код лежал в общем свёртке и грузился всем — в
 * том числе тому, кто просто открыл план склада. Поэтому здесь `import()`:
 * браузер запросит файл в тот момент, когда человек нажмёт «Загрузить файл» или
 * «Скачать шаблон», и ни секундой раньше.
 *
 * Обёртка общая на всё приложение по двум причинам. Первая: загрузку хочется
 * запомнить — второй импорт того же модуля браузер отдаёт из памяти, но лишний
 * `await` в горячем пути всё равно ни к чему. Вторая: чтение первого листа и
 * запись книги написаны одинаково в разных экранах, и место для такого кода
 * одно.
 */

type Xlsx = typeof import("xlsx");

let pending: Promise<Xlsx> | null = null;

/**
 * Загружает SheetJS — один раз за сеанс. Промис сохраняется, а не результат:
 * два нажатия подряд не должны запускать две загрузки.
 *
 * Бросает, если файл не удалось получить (нет сети, обновился деплой). Вызовы
 * обязаны это ловить: кнопка, которая молча ничего не делает, хуже ошибки.
 */
function loadXlsx(): Promise<Xlsx> {
  if (!pending) {
    pending = import("xlsx").catch((err) => {
      // Сбрасываем, иначе неудача запомнится навсегда и повторное нажатие
      // будет падать даже после того, как сеть вернулась.
      pending = null;
      throw err;
    });
  }
  return pending;
}

/**
 * Первый лист книги → матрица строк.
 *
 * `null` — в книге нет ни одного листа; это не поломка файла, а отдельный
 * случай, и сообщение о нём у каждого экрана своё. Всё остальное (битый файл,
 * не та кодировка, недоступная библиотека) улетает исключением.
 */
export async function readSheetMatrix(buf: ArrayBuffer): Promise<string[][] | null> {
  const XLSX = await loadXlsx();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0];
  const sheet = sheetName ? wb.Sheets[sheetName] : undefined;
  if (!sheet) return null;

  // `raw: false` — числа и даты приходят строками, ровно как их видит человек в
  // Excel: разбор значений дальше общий с CSV, и второй ветки для книг не надо.
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });
  return aoa.map((row) => (row as unknown[]).map((c) => (c == null ? "" : String(c))));
}

/** Матрица → книга из одного листа → файл в загрузках. */
export async function downloadSheet(
  matrix: (string | number)[][],
  sheetName: string,
  fileName: string,
): Promise<void> {
  const XLSX = await loadXlsx();
  const ws = XLSX.utils.aoa_to_sheet(matrix);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, fileName);
}
