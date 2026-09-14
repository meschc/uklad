import { describe, expect, it } from "vitest";
import { iconWithBadge, titleWithCount } from "../tabBadge";

/**
 * Счётчик непрочитанного на вкладке.
 *
 * Обе функции ошибаются тихо: заголовок с лишними скобками и иконка со сломанной
 * разметкой выглядят как «просто не работает», и заметить это можно только
 * глазами на живой вкладке. Проверяем то, что ломается: ноль (бейджа быть не
 * должно вовсе), предел счёта и разметку, в которую нечего дописать.
 */

const ICON = '<svg viewBox="0 0 32 32"><rect width="32" height="32"/></svg>';

describe("titleWithCount", () => {
  it("оставляет заголовок как есть, пока непрочитанного нет", () => {
    // Arrange · Act
    const title = titleWithCount("Уклад", 0);

    // Assert
    expect(title).toBe("Уклад");
  });

  it("ставит число перед заголовком, а не после", () => {
    // Arrange · Act
    const title = titleWithCount("Уклад", 3);

    // Assert — в узком корешке вкладки видно только начало строки
    expect(title).toBe("(3) Уклад");
  });

  it("не считает дальше девяти", () => {
    // Arrange · Act
    const title = titleWithCount("Уклад", 42);

    // Assert
    expect(title).toBe("(9+) Уклад");
  });
});

describe("iconWithBadge", () => {
  it("дописывает бейдж внутрь иконки, а не после неё", () => {
    // Arrange · Act
    const svg = iconWithBadge(ICON, 2);

    // Assert — бейдж рисуется поверх знака, значит стоит перед закрытием
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain(">2</text>");
    expect(svg.indexOf("<text")).toBeLessThan(svg.indexOf("</svg>"));
  });

  it("сохраняет исходный знак", () => {
    // Arrange · Act
    const svg = iconWithBadge(ICON, 1);

    // Assert
    expect(svg).toContain('<rect width="32" height="32"/>');
  });

  it("без непрочитанного отдаёт иконку нетронутой", () => {
    // Arrange · Act
    const svg = iconWithBadge(ICON, 0);

    // Assert
    expect(svg).toBe(ICON);
  });

  it("не портит разметку, в которую нечего дописать", () => {
    // Arrange — иконка не дочиталась целиком
    const broken = '<svg viewBox="0 0 32 32">';

    // Act
    const svg = iconWithBadge(broken, 5);

    // Assert — сломанная иконка хуже, чем иконка без бейджа
    expect(svg).toBe(broken);
  });
});
