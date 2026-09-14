// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatPanel } from "../ChatPanel";
import { setLang } from "../../lib/lang";

/**
 * Панель «Спросить склад» — макет переписки, а не канал связи.
 *
 * Проверяем не оформление, а честность: на карточке склада эта панель стоит
 * прямо под настоящей формой заявки, и человек, написавший сюда вопрос, обязан
 * понимать, что вопрос не ушёл. Иначе он будет ждать ответа, которого никто не
 * получил, — а это хуже, чем не иметь чата вовсе.
 *
 * Второе проверяемое свойство — тема разговора. Страница знает, о чём она, и
 * подставляет контекст сама; если он пропадёт из панели, восстановить его
 * будет неоткуда.
 *
 * Язык ставится явно: без адреса и сохранённого выбора витрина берёт его из
 * `navigator.languages`, а в тестовом браузере там английский.
 */
describe("ChatPanel — макет переписки со складом", () => {
  beforeEach(() => {
    setLang("ru");
  });

  test("говорит, что сообщение отсюда не уходит, до того как его написали", () => {
    // Arrange + Act
    render(<ChatPanel to="Склад на Ленинском" subject="условия хранения" />);

    // Assert
    expect(screen.getByText(/отсюда сообщение не уходит/i)).toBeInTheDocument();
  });

  test("показывает тему разговора: складу не придётся выяснять, о чём речь", () => {
    // Arrange + Act
    render(<ChatPanel to="Склад на Ленинском" subject="условия хранения" />);

    // Assert
    expect(screen.getByText(/условия хранения/)).toBeInTheDocument();
  });

  test("отправленное сообщение не выдаёт себя за дошедшее до склада", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<ChatPanel to="Склад на Ленинском" subject="условия хранения" />);

    // Act
    await user.type(screen.getByRole("textbox"), "Во сколько у вас приёмка?");
    await user.click(screen.getByRole("button", { name: "Отправить" }));

    // Assert: сообщение в ленте есть, слова «отправлено» под ним нет.
    expect(screen.getByText("Во сколько у вас приёмка?")).toBeInTheDocument();
    expect(screen.queryByText(/^отправлено$/i)).not.toBeInTheDocument();
    expect(screen.getByText(/так это увидит склад/i)).toBeInTheDocument();
  });
});
