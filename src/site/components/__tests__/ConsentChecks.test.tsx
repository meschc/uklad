// @vitest-environment jsdom
import { useState } from "react";
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConsentChecks, type ConsentState } from "../ConsentChecks";

/**
 * Галочки согласий — единственное место витрины, где вёрстка отвечает за
 * соблюдение закона, а не за удобство.
 *
 * 152-ФЗ требует, чтобы согласие на обработку данных было конкретным,
 * информированным и сознательным. На практике это три проверяемых свойства:
 * поля пустые до того, как их тронули; согласие на рекламу отдельное от
 * основного; отказ от рекламы ничего не ломает. Ровно их тут и проверяем —
 * не оформление, а то, из-за чего форму могут признать недействительной.
 *
 * Компонент управляемый, поэтому вокруг него стенд с состоянием: без него
 * галочка не изменится от нажатия и тест проверял бы сам себя.
 */
function Stand({ initial }: { initial?: ConsentState }) {
  const [value, setValue] = useState<ConsentState>(initial ?? { data: false, ads: false });
  return <ConsentChecks value={value} onChange={setValue} />;
}

/** Обе галочки в порядке разметки: сначала данные, потом реклама. */
function boxes(): HTMLInputElement[] {
  return screen.getAllByRole("checkbox");
}

describe("ConsentChecks", () => {
  test("обе галочки пустые до того, как их тронули", () => {
    // Arrange · Act
    render(<Stand />);

    // Assert
    const [data, ads] = boxes();
    expect(data).not.toBeChecked();
    expect(ads).not.toBeChecked();
  });

  test("согласие на данные и на рекламу — два разных поля", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<Stand />);

    // Act — отмечаем только обработку данных
    await user.click(boxes()[0]);

    // Assert — реклама осталась пустой: одной галочкой «принимаю всё» не отделаться
    expect(boxes()[0]).toBeChecked();
    expect(boxes()[1]).not.toBeChecked();
  });

  test("реклама отмечается и снимается, не трогая согласие на данные", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<Stand initial={{ data: true, ads: false }} />);

    // Act
    await user.click(boxes()[1]);
    await user.click(boxes()[1]);

    // Assert
    expect(boxes()[1]).not.toBeChecked();
    expect(boxes()[0]).toBeChecked();
  });

  test("документы открываются в новой вкладке, чтобы не стереть заполненную форму", () => {
    // Arrange · Act
    render(<Stand />);

    // Assert — ссылки на согласие и политику ведут в правовой раздел
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link.getAttribute("href")).toMatch(/\/legal\//);
    }
  });
});
