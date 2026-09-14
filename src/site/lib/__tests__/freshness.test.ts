import { describe, expect, test } from "vitest";
import { DAY_MS } from "../date";
import { freshness, STALE_DAYS } from "../freshness";

/** Момент отсчёта: фиксированный, чтобы тест не зависел от часов машины. */
const NOW = Date.UTC(2026, 8, 12);

/** Момент `days` суток назад. */
const ago = (days: number): number => NOW - days * DAY_MS;

describe("freshness", () => {
  test("склад на Укладе показан как живой, даже если дата подтверждения старая", () => {
    // Arrange — дата нарочно древняя: у склада на Укладе она ничего не решает.
    const confirmedAt = ago(STALE_DAYS * 10);

    // Act
    const result = freshness(confirmedAt, NOW, true);

    // Assert
    expect(result).toBe("live");
  });

  test("подтверждение в пределах срока считается свежим", () => {
    expect(freshness(ago(1), NOW, false)).toBe("fresh");
  });

  test("на границе срока данные ещё свежие, а суткой позже — уже нет", () => {
    // Arrange / Act
    const onEdge = freshness(ago(STALE_DAYS), NOW, false);
    const pastEdge = freshness(ago(STALE_DAYS + 1), NOW, false);

    // Assert — порог трактуется как «дольше», а не «не меньше»: ровно
    // девяностый день ещё не повод сомневаться в цене.
    expect(onEdge).toBe("fresh");
    expect(pastEdge).toBe("stale");
  });

  test("дата из будущего не делает данные несвежими", () => {
    // Arrange — часы клиента могут отставать от сборки витрины.
    const confirmedAt = NOW + DAY_MS;

    // Act / Assert
    expect(freshness(confirmedAt, NOW, false)).toBe("fresh");
  });
});
