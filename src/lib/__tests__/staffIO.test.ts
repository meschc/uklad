import { describe, expect, it } from "vitest";
import type { StaffMember } from "../types";
import { csvToStaff, staffToCsv } from "../staffIO";

/**
 * Разбор и сборка CSV с персоналом — граница системы: файл приходит из Excel,
 * из чужой выгрузки, из ручной правки, и доверять ему нельзя. Отдельный повод
 * держать эти проверки — колонка «Фото»: она уже один раз тихо терялась по
 * дороге в стор, и заметить это по списку людей было нечем.
 */

const member = (over: Partial<StaffMember> = {}): StaffMember => ({
  id: "staff_1",
  name: "Иван Петров",
  role: "Кладовщик",
  ...over,
});

describe("csvToStaff", () => {
  it("пропускает строку заголовка", () => {
    // Arrange
    const text = "Имя;Должность;Телефон;Почта;Фото\nАнна;Приёмщик;;;";

    // Act
    const rows = csvToStaff(text);

    // Assert
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Анна");
  });

  it("читает файл без заголовка целиком", () => {
    // Arrange: чужая выгрузка вполне может начинаться сразу с людей.
    const text = "Анна;Приёмщик\nПётр;Грузчик";

    // Act
    const rows = csvToStaff(text);

    // Assert
    expect(rows.map((r) => r.name)).toEqual(["Анна", "Пётр"]);
  });

  it("выбрасывает строки без имени", () => {
    // Arrange: пустая строка — мусор, а не сотрудник, которого стоит завести.
    const text = "Имя;Должность\nАнна;Приёмщик\n;Грузчик\n   ;\n";

    // Act
    const rows = csvToStaff(text);

    // Assert
    expect(rows.map((r) => r.name)).toEqual(["Анна"]);
  });

  it("доносит ссылку на фото до последней колонки", () => {
    // Arrange
    const text =
      "Имя;Должность;Телефон;Почта;Фото\nАнна;Приёмщик;+7 916 000-00-01;a@uklad.ru;https://example.com/a.jpg";

    // Act
    const [row] = csvToStaff(text);

    // Assert
    expect(row.photoUrl).toBe("https://example.com/a.jpg");
  });

  it("оставляет пустые необязательные поля незаполненными, а не пустой строкой", () => {
    // Arrange: пустая строка в телефоне вылезла бы в карточке пустой ссылкой.
    const text = "Имя;Должность;;;\nАнна;Приёмщик;;;";

    // Act
    const [row] = csvToStaff(text);

    // Assert
    expect(row.phone).toBeUndefined();
    expect(row.email).toBeUndefined();
    expect(row.photoUrl).toBeUndefined();
  });

  it("не разрывает значение в кавычках по разделителю", () => {
    // Arrange: должность с запятой — обычное дело в чужой выгрузке.
    const text = 'Имя;Должность\nАнна;"Приёмщик, старший"';

    // Act
    const [row] = csvToStaff(text);

    // Assert
    expect(row.role).toBe("Приёмщик, старший");
  });

  it("понимает запятую как разделитель наравне с точкой с запятой", () => {
    // Arrange: Excel в английской локали сохраняет через запятую.
    const text = "Name,Role\nAnna,Picker";

    // Act
    const rows = csvToStaff(text);

    // Assert
    expect(rows).toEqual([
      { name: "Anna", role: "Picker", phone: undefined, email: undefined, photoUrl: undefined },
    ]);
  });

  it("на пустом файле отдаёт пустой список, а не падает", () => {
    // Arrange, Act, Assert
    expect(csvToStaff("")).toEqual([]);
    expect(csvToStaff("\n\n  \n")).toEqual([]);
  });
});

describe("staffToCsv", () => {
  it("выгружает шапку и человека одной строкой", () => {
    // Arrange
    const staff = [member({ phone: "+7 916 000-00-01", email: "ivan@uklad.ru" })];

    // Act
    const csv = staffToCsv(staff);

    // Assert
    expect(csv.split("\n")).toEqual([
      "Имя;Должность;Телефон;Почта;Фото",
      "Иван Петров;Кладовщик;+7 916 000-00-01;ivan@uklad.ru;",
    ]);
  });

  it("экранирует значение с разделителем внутри", () => {
    // Arrange
    const staff = [member({ role: "Приёмщик, старший" })];

    // Act
    const csv = staffToCsv(staff);

    // Assert
    expect(csv).toContain('"Приёмщик, старший"');
  });

  it("удваивает кавычки внутри значения", () => {
    // Arrange
    const staff = [member({ name: 'Иван "Ваня" Петров' })];

    // Act
    const csv = staffToCsv(staff);

    // Assert
    expect(csv).toContain('"Иван ""Ваня"" Петров"');
  });

  it("переживает выгрузку и обратный разбор без потерь", () => {
    // Arrange: выгруженный файл человек правит в Excel и грузит назад — то,
    // что уехало, обязано вернуться тем же.
    const staff = [
      member({
        name: "Иван Петров",
        role: "Приёмщик, старший",
        phone: "+7 916 000-00-01",
        email: "ivan@uklad.ru",
        photoUrl: "https://example.com/a.jpg",
      }),
    ];

    // Act
    const back = csvToStaff(staffToCsv(staff));

    // Assert
    expect(back).toEqual([
      {
        name: "Иван Петров",
        role: "Приёмщик, старший",
        phone: "+7 916 000-00-01",
        email: "ivan@uklad.ru",
        photoUrl: "https://example.com/a.jpg",
      },
    ]);
  });
});
