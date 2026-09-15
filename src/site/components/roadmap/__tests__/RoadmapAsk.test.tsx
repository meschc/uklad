// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RoadmapAsk } from "../RoadmapAsk";
import { clearVotes, readVotes, toggleVote } from "../../../lib/roadmapVotes";

/**
 * Форма под дорожной картой.
 *
 * Проверяется не оформление, а два обещания, данные человеку на этой странице.
 * Первое: отправить пустоту нельзя — либо отметка, либо идея, иначе письмо
 * приходит ни о чём. Второе: без согласия на обработку данных кнопка не
 * работает, и рядом с ней написано почему (приёмник такую заявку всё равно
 * отклонит — см. `server/leads/lead.js`).
 *
 * Тексты в проверках английские: страница без явного языка в адресе берёт его
 * из `navigator.languages`, а в тестовом браузере там английский.
 *
 * Сама отправка тут не вызывается: приёмник в тестах не настроен, и нажатие
 * ушло бы в `window.location` почтовой программы. Транспорт проверяется в
 * `lib/__tests__/leads.test.ts`, отметки — в `lib/__tests__/roadmapVotes.test.ts`.
 */

/** Пункт настоящей карты, за который можно голосовать. */
const ITEM_ID = "database";

/** Кнопка отправки. Приёмника в тестах нет, поэтому подпись — про письмо. */
function submit(): HTMLElement {
  return screen.getByRole("button", { name: /Write an email|^Send$/ });
}

beforeEach(() => {
  localStorage.clear();
  clearVotes();
});

describe("RoadmapAsk", () => {
  test("без отметок и без идеи отправлять нечего — и это сказано словами", () => {
    // Arrange · Act
    render(<RoadmapAsk />);

    // Assert
    expect(submit()).toBeDisabled();
    expect(screen.getByText(/Mark at least one item/)).toBeInTheDocument();
  });

  test("идея без согласия на обработку данных не отправляется", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<RoadmapAsk />);

    // Act
    await user.type(screen.getByLabelText("Your idea"), "We need a 1C export");

    // Assert — подсказка сменилась с «нечего отправлять» на согласие
    expect(submit()).toBeDisabled();
    expect(screen.getByText(/Tick the consent/)).toBeInTheDocument();
  });

  test("идея и согласие вместе открывают отправку", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<RoadmapAsk />);

    // Act
    await user.type(screen.getByLabelText("Your idea"), "We need a 1C export");
    await user.click(screen.getAllByRole("checkbox")[0]);

    // Assert
    expect(submit()).toBeEnabled();
  });

  test("одной отметки достаточно: идея необязательна", async () => {
    // Arrange
    const user = userEvent.setup();
    toggleVote(ITEM_ID);
    render(<RoadmapAsk />);

    // Act
    await user.click(screen.getAllByRole("checkbox")[0]);

    // Assert
    expect(submit()).toBeEnabled();
  });

  test("отмеченное перечислено и снимается прямо из формы", async () => {
    // Arrange
    const user = userEvent.setup();
    toggleVote(ITEM_ID);
    render(<RoadmapAsk />);

    // Act
    await user.click(screen.getByRole("button", { name: /^Unmark/ }));

    // Assert
    expect(readVotes()).toEqual([]);
    expect(screen.getByText(/Nothing marked yet/)).toBeInTheDocument();
  });

  test("«снять все» очищает доску целиком", async () => {
    // Arrange
    const user = userEvent.setup();
    toggleVote(ITEM_ID);
    toggleVote("rights");
    render(<RoadmapAsk />);

    // Act
    await user.click(screen.getByRole("button", { name: "Clear all" }));

    // Assert
    expect(readVotes()).toEqual([]);
    expect(submit()).toBeDisabled();
  });
});
