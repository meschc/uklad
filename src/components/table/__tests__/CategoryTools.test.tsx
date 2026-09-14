// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEditor } from "@/lib/store";
import { useT } from "@/lib/i18n";
import type { ProductCategory } from "@/lib/types";
import { CategoryTools } from "../CategoryTools";

/**
 * Правка справочника категорий. Проверяется здесь то, что легко разъезжается
 * между экранами и потому уже разъезжалось:
 *
 *  · занятое имя — это ОТВЕТ домена, а не сбой: повторять его бессмысленно,
 *    и кнопка повтором становиться не должна;
 *  · сбой связи — наоборот, ровно тот случай, ради которого кнопка становится
 *    «Повторить» (п.3.2.2), а введённое имя остаётся на месте;
 *  · удаление открытой категории обязано увести выбор на живую — иначе форма
 *    добавления поля остаётся привязанной к тому, чего больше нет.
 *
 * Стор поднимается настоящий: категории живут в нём, и заглушка проверяла бы
 * не компонент, а выдумку про него.
 */

/** Хозяин выбора — в приложении им работает конструктор полей. */
function Host({ initial }: { initial: ProductCategory }) {
  const [category, setCategory] = useState<ProductCategory>(initial);
  const t = useT();
  return (
    <>
      <p data-testid="current">{category}</p>
      <CategoryTools category={category} onPick={setCategory} t={t} />
    </>
  );
}

/** Настоящее действие стора — чтобы вернуть его после подмены на сбойное. */
const realAddCategory = useEditor.getState().addCategory;

describe("CategoryTools", () => {
  beforeEach(() => {
    // Товары и поля здесь не нужны, а удаление категории их переписывает:
    // пустой список делает тест независимым от состава демо-данных.
    useEditor.setState({
      categories: ["Одежда", "Электроника"],
      products: [],
      categoryFields: [],
      addCategory: realAddCategory,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("занятое имя отклоняется, но повторить не предлагает", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<Host initial="Одежда" />);
    await user.click(screen.getByTitle("Добавить категорию"));

    // Act
    await user.type(screen.getByRole("textbox"), "Электроника");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    // Assert
    expect(screen.getByRole("alert")).toHaveTextContent(/уже есть/);
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Повторить" })).toBeNull();
    expect(screen.getByRole("textbox")).toHaveValue("Электроника");
  });

  test("сбой связи превращает кнопку в повтор, удачный повтор заводит категорию", async () => {
    // Arrange
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    useEditor.setState({
      addCategory: () => {
        throw new Error("сеть недоступна");
      },
    });
    render(<Host initial="Одежда" />);
    await user.click(screen.getByTitle("Добавить категорию"));
    await user.type(screen.getByRole("textbox"), "Хозтовары");

    // Act
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    // Assert
    expect(screen.getByRole("alert")).toHaveTextContent(/Не получилось/);
    expect(screen.getByRole("textbox")).toHaveValue("Хозтовары");
    const retry = screen.getByRole("button", { name: "Повторить" });

    // Act — связь вернулась
    useEditor.setState({ addCategory: realAddCategory });
    await user.click(retry);

    // Assert
    expect(useEditor.getState().categories).toContain("Хозтовары");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByTestId("current")).toHaveTextContent("Хозтовары");
  });

  test("удаление открытой категории уводит выбор на оставшуюся", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<Host initial="Электроника" />);

    // Act
    await user.click(screen.getByTitle("Удалить категорию"));

    // Assert
    expect(useEditor.getState().categories).toEqual(["Одежда"]);
    expect(screen.getByTestId("current")).toHaveTextContent("Одежда");
  });

  test("последнюю категорию удалить нельзя", () => {
    // Arrange
    useEditor.setState({ categories: ["Одежда"] });

    // Act
    render(<Host initial="Одежда" />);

    // Assert
    expect(screen.getByTitle("Удалить категорию")).toBeDisabled();
  });
});
