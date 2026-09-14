import { describe, expect, test } from "vitest";
import { LEGAL_BY_SLUG } from "../../data/legal";
import { list, note, p, table, type LegalDoc } from "../../data/legal/types";
import { MIN_QUERY, normalizeQuery, searchDoc, splitMatches } from "../legalSearch";

/**
 * Поиск по правовому документу.
 *
 * Проверяем не «поле ищет», а то, ради чего оно заведено: человек набирает
 * слово так, как оно пишется у него в голове — без «ё», в другом регистре, —
 * и должен попасть в раздел, где это слово стоит. И обратное: счёт совпадений
 * не должен врать, потому что по нему человек решает, есть ли в документе то,
 * за чем он пришёл.
 *
 * Один случай идёт по настоящему документу, а не по выдуманному: тексты
 * правим не мы, и поиск обязан работать по тому, что в них написано на самом
 * деле, — с неразрывными пробелами и «ё» включительно.
 */

const DOC: LegalDoc = {
  slug: "test",
  title: "Тестовый документ",
  short: "Тест",
  lead: "Здесь слово срок стоит во врезке, а не в документе.",
  basis: "Основание документа",
  sections: [
    {
      id: "storage",
      title: "Сроки хранения",
      blocks: [
        p("Срок хранения — три года со дня последнего обращения."),
        list("Заявки — три года.", "Переписка — один год."),
      ],
    },
    {
      id: "rights",
      title: "Права субъекта",
      blocks: [
        note("Отозвать согласие можно в любой срок."),
        table(["Право", "Как"], [["Доступ", "Письмом"]]),
      ],
    },
    {
      id: "quiet",
      title: "Раздел без совпадений",
      blocks: [p("Здесь про другое.")],
    },
  ],
};

describe("приведение запроса", () => {
  test("снимает регистр, «ё» и края", () => {
    expect(normalizeQuery("  СрЁк ")).toBe("срек");
  });

  test("неразрывный пробел в запросе становится обычным", () => {
    // Набрать неразрывный пробел человек не может, но вставить скопированный
    // кусок документа — запросто.
    expect(normalizeQuery("три года")).toBe("три года");
  });
});

describe("поиск по документу", () => {
  test("короткий запрос ждёт, а не отвечает «не нашлось»", () => {
    // Arrange / Act
    const hits = searchDoc(DOC, "с");

    // Assert — разница важна: «ничего нет» и «доберите букву» это разные
    // сообщения, и второе не должно выглядеть первым.
    expect(MIN_QUERY).toBe(2);
    expect(hits.tooShort).toBe(true);
    expect(hits.total).toBe(0);
    expect(hits.query).toBe("");
  });

  test("пустой запрос не ищет и ни на что не жалуется", () => {
    expect(searchDoc(DOC, "   ")).toEqual({ query: "", tooShort: false, total: 0, sections: [] });
  });

  test("считает совпадения в заголовках, абзацах, списках, врезках и таблицах", () => {
    // Act
    const hits = searchDoc(DOC, "СРОК");

    // Assert — «Сроки» в заголовке, «Срок» в абзаце, «срок» во врезке: регистр
    // и окончание слова совпадению не мешают.
    expect(hits.total).toBe(3);
    expect(hits.sections.map((s) => s.id)).toEqual(["storage", "rights"]);
    expect(hits.sections[0].count).toBe(2);
    expect(hits.sections[0].title).toBe("Сроки хранения");
  });

  test("раздел без совпадений в список не попадает", () => {
    const hits = searchDoc(DOC, "срок");
    expect(hits.sections.some((s) => s.id === "quiet")).toBe(false);
  });

  test("разделы идут в порядке документа, а не по числу совпадений", () => {
    // Иначе список под полем перестаёт быть дорогой по документу: человек ищет
    // не «где гуще», а «где по ходу текста».
    // «ра» есть в заголовке каждого из трёх разделов — сравнивать есть что.
    const hits = searchDoc(DOC, "ра");
    expect(hits.sections.map((s) => s.id)).toEqual(["storage", "rights", "quiet"]);
  });

  test("находит в таблице и в элементе списка", () => {
    expect(searchDoc(DOC, "письмом").total).toBe(1);
    expect(searchDoc(DOC, "переписка").total).toBe(1);
  });

  test("врезка и основание документа в счёт не идут", () => {
    // Слово «срок» стоит и в нашей врезке `lead`, но она — рамка вокруг
    // документа, а не его текст: иначе счёт совпадений расходится со списком
    // разделов, и человек не понимает, где потерялось одно.
    const hits = searchDoc(DOC, "срок");
    expect(hits.total).toBe(hits.sections.reduce((sum, s) => sum + s.count, 0));
  });

  test("в настоящем документе находится то, что в нём написано", () => {
    // Тексты документов пишем не мы; поиск обязан работать по ним как есть.
    const hits = searchDoc(LEGAL_BY_SLUG.privacy, "персональных данных");
    expect(hits.total).toBeGreaterThan(0);
    expect(hits.sections.length).toBeGreaterThan(0);
  });
});

describe("подсветка", () => {
  test("без запроса текст остаётся одним куском", () => {
    expect(splitMatches("Срок хранения", "")).toEqual([{ text: "Срок хранения", hit: false }]);
  });

  test("режет текст вокруг совпадения и возвращает исходное написание", () => {
    // Act
    const parts = splitMatches("Срок хранения — три года", "срок");

    // Assert — в подсветку уходит «Срок» документа, а не «срок» запроса:
    // приведение живёт в сравнении и наружу не протекает.
    expect(parts).toEqual([
      { text: "Срок", hit: true },
      { text: " хранения — три года", hit: false },
    ]);
  });

  test("находит все вхождения, а не первое", () => {
    const parts = splitMatches("год, ещё год и год", "год");
    expect(parts.filter((part) => part.hit)).toHaveLength(3);
  });

  test("совпадения подряд не склеиваются в одно", () => {
    const parts = splitMatches("абабаб", "аб");
    expect(parts).toEqual([
      { text: "аб", hit: true },
      { text: "аб", hit: true },
      { text: "аб", hit: true },
    ]);
  });

  test("«ё» в документе находится по «е» в запросе и подсвечивается как «ё»", () => {
    const parts = splitMatches("Учёт заявок", normalizeQuery("Учет"));
    expect(parts[0]).toEqual({ text: "Учёт", hit: true });
  });

  test("собранные куски дают исходный текст без потерь", () => {
    // Проверка на то, ради чего length-сохраняющее приведение и заведено:
    // сдвиг хотя бы на знак съел бы или удвоил букву в документе.
    const text = "Срок хранения — Ёлка, ёлка и ещё ёлка";
    const parts = splitMatches(text, normalizeQuery("елка"));
    expect(parts.map((part) => part.text).join("")).toBe(text);
    expect(parts.filter((part) => part.hit)).toHaveLength(3);
  });
});
