// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LEGAL_BY_SLUG } from "../../../data/legal";
import { setLang } from "../../../lib/lang";
import { LegalScreen } from "../LegalScreen";

/**
 * Поиск по правовому документу — со стороны человека, а не движка.
 *
 * Сам поиск проверен отдельно (`lib/__tests__/legalSearch.test.ts`), здесь
 * важно другое: набранное слово подсвечивается в тексте, под полем появляется
 * дорога к разделу — и документ при этом остаётся целым. Последнее — главное:
 * правовой текст, из которого поиск молча вынул половину разделов, человек
 * прочитает как полный.
 *
 * Документ берётся настоящий: тексты пишем не мы, и поиск обязан работать по
 * тому, что в них написано.
 */
const DOC = LEGAL_BY_SLUG.privacy;

/** Сколько разделов видно на экране — по заголовкам второго уровня. */
function sectionCount(): number {
  return screen.getAllByRole("heading", { level: 2 }).length;
}

function searchBlock(): HTMLElement {
  return screen.getByRole("search");
}

describe("LegalScreen — поиск по документу", () => {
  beforeEach(() => {
    // Без явного языка витрина берёт его из `navigator.languages`, а в тестовом
    // браузере там английский: подсказки приехали бы не те, что видит человек.
    setLang("ru");
  });

  test("найденное подсвечивается, а документ остаётся целым", async () => {
    // Arrange
    render(<LegalScreen slug="privacy" />);
    const before = sectionCount();

    // Act
    await userEvent.type(screen.getByRole("searchbox"), "срок хранения");

    // Assert — подсветка появилась…
    const marks = document.querySelectorAll("mark");
    expect(marks.length).toBeGreaterThan(0);
    expect(marks[0].textContent?.toLowerCase()).toBe("срок хранения");

    // …и ни один раздел с экрана не пропал.
    expect(sectionCount()).toBe(before);
    expect(before).toBe(DOC.sections.length);
  });

  test("под полем появляется ссылка на раздел, где нашлось", async () => {
    // Arrange
    render(<LegalScreen slug="privacy" />);

    // Act
    await userEvent.type(screen.getByRole("searchbox"), "срок хранения");

    // Assert — ссылка, а не кнопка: на пункт документа нужно уметь сослаться.
    const link = within(searchBlock()).getByRole("link", { name: /Сроки обработки и хранения/ });
    expect(link).toHaveAttribute("href", "#terms-storage");
  });

  test("одна буква — это «доберите знак», а не «ничего нет»", async () => {
    // Arrange
    render(<LegalScreen slug="privacy" />);

    // Act
    await userEvent.type(screen.getByRole("searchbox"), "с");

    // Assert
    expect(within(searchBlock()).getByText("Наберите хотя бы два знака.")).toBeInTheDocument();
    expect(document.querySelectorAll("mark")).toHaveLength(0);
  });

  test("когда не нашлось, объясняем почему, а не молчим", async () => {
    // Arrange
    render(<LegalScreen slug="privacy" />);

    // Act
    await userEvent.type(screen.getByRole("searchbox"), "щщщщ");

    // Assert — про точное совпадение сказано прямо: иначе поиск выглядит
    // сломанным, когда человек набрал слово со склонением.
    expect(within(searchBlock()).getByText(/точному совпадению/)).toBeInTheDocument();
  });

  test("очистка возвращает документ в исходный вид", async () => {
    // Arrange
    render(<LegalScreen slug="privacy" />);
    await userEvent.type(screen.getByRole("searchbox"), "срок хранения");
    expect(document.querySelectorAll("mark").length).toBeGreaterThan(0);

    // Act
    await userEvent.click(within(searchBlock()).getByRole("button", { name: "Очистить поиск" }));

    // Assert
    expect(document.querySelectorAll("mark")).toHaveLength(0);
    expect(screen.getByRole("searchbox")).toHaveValue("");
  });
});
