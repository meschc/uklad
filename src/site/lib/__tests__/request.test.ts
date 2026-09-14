import { describe, expect, test } from "vitest";
import { EMPTY_REQUEST, requestGaps, todayISO, type RequestDraft } from "../request";
import { EMPTY_VOLUME } from "../estimate";

/**
 * Проверка заявки складу.
 *
 * Заявка — единственное место витрины, где человек оставляет о себе данные, и
 * цена ошибки здесь не в оформлении. Неполная заявка уходит складу как пустая:
 * тот отвечает не условиями, а вопросами, и обещанный час ответа превращается
 * в сутки переписки. Поэтому проверяется не «форма покрасилась красным», а то,
 * что до отправки не доходит заявка, на которую нечего ответить.
 */

const TODAY = "2026-09-06";

/** Заполненная заявка — от неё в каждом тесте отнимают ровно одно. */
const FULL: RequestDraft = {
  goods: "Одежда и обувь",
  volume: { places: 120, boxes: 40, orders: 900, marking: 0 },
  date: "2026-09-20",
  city: "Казань",
};

describe("Готовность заявки", () => {
  test("заполненной заявке не хватает ничего", () => {
    // Arrange · Act
    const gaps = requestGaps(FULL, TODAY);

    // Assert
    expect(gaps).toEqual([]);
  });

  test("пустая заявка называет все свои пробелы по порядку формы", () => {
    // Порядок важен: форма подписывает ближайшее незаполненное поле, и
    // человека ведут сверху вниз, а не по случайному полю в середине.
    const gaps = requestGaps(EMPTY_REQUEST, TODAY);

    expect(gaps).toEqual(["goods", "volume", "date", "city"]);
  });

  test("пробелы вместо товара — то же, что пустое поле", () => {
    // Arrange
    const draft: RequestDraft = { ...FULL, goods: "   ", city: "\t" };

    // Act
    const gaps = requestGaps(draft, TODAY);

    // Assert
    expect(gaps).toEqual(["goods", "city"]);
  });

  test("объём заявки — тот же, что у калькулятора: ни одного числа мало", () => {
    // Ноль во всех полях — это не «нулевой объём», это «объём не назвали».
    // Склад по такой заявке ответить не может.
    expect(requestGaps({ ...FULL, volume: EMPTY_VOLUME }, TODAY)).toEqual(["volume"]);
    expect(requestGaps({ ...FULL, volume: { ...EMPTY_VOLUME, boxes: 1 } }, TODAY)).toEqual([]);
  });

  test("сегодняшняя дата поставки годится, вчерашняя — нет", () => {
    // Граница на самом дне: «сегодня» — это ещё не прошлое.
    expect(requestGaps({ ...FULL, date: TODAY }, TODAY)).toEqual([]);
    expect(requestGaps({ ...FULL, date: "2026-09-05" }, TODAY)).toEqual(["past"]);
  });

  test("прошедшая дата и пустая — разные пробелы", () => {
    // Разные, потому что человеку говорят разное: одному «укажите дату»,
    // другому «эта дата уже прошла». Общее «дата не годится» не помогает ни
    // тому, ни другому.
    expect(requestGaps({ ...FULL, date: "" }, TODAY)).toEqual(["date"]);
    expect(requestGaps({ ...FULL, date: "2020-01-01" }, TODAY)).toEqual(["past"]);
  });
});

describe("Сегодняшнее число для поля даты", () => {
  test("собирается по местному времени, а не по Гринвичу", () => {
    // Час ночи в Москве — это уже новые сутки, а по Гринвичу ещё вчерашние.
    // Считай мы по `toISOString`, вчерашняя дата ночью проходила бы как
    // сегодняшняя.
    const night = new Date(2026, 8, 6, 1, 30);

    expect(todayISO(night)).toBe("2026-09-06");
  });

  test("месяц и день дополняются нулём — иначе строки не сравнить", () => {
    // Проверка даты — сравнение строк, а «2026-9-6» в этом сравнении встаёт
    // не туда, куда встала бы сама дата.
    expect(todayISO(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
