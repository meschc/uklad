// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useTabBadge } from "../tabBadge";

/**
 * Счётчик на вкладке со стороны React.
 *
 * Сами строки проверены рядом (`tabBadge.test.ts`), здесь — привязка к жизни
 * компонента: заголовок обязан идти за числом непрочитанных и обязан вернуться
 * на место, когда кабинет закрыли. Второе важнее первого: оставленное «(3)»
 * переживает сам кабинет и врёт уже на чужой странице.
 *
 * Иконку здесь не трогаем: в разметке теста её тега нет, и подменять нечего —
 * это ровно тот случай, когда счётчик обязан работать без неё.
 */
const BASE = "Уклад — редактор плана склада";

describe("useTabBadge", () => {
  beforeEach(() => {
    document.title = BASE;
  });

  it("ставит число в заголовок и убирает его, когда всё прочитано", () => {
    // Arrange
    const { rerender } = renderHook(({ n }: { n: number }) => useTabBadge(n), {
      initialProps: { n: 0 },
    });
    expect(document.title).toBe(BASE);

    // Act
    rerender({ n: 2 });

    // Assert
    expect(document.title).toBe(`(2) ${BASE}`);

    // Act — переписку открыли и прочитали
    rerender({ n: 0 });

    // Assert
    expect(document.title).toBe(BASE);
  });

  it("возвращает заголовок вкладки, когда кабинет закрыт", () => {
    // Arrange
    const { unmount } = renderHook(() => useTabBadge(4));
    expect(document.title).toBe(`(4) ${BASE}`);

    // Act
    unmount();

    // Assert
    expect(document.title).toBe(BASE);
  });
});
