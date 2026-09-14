import { describe, expect, it, vi } from "vitest";
import { attempt, fail, ok } from "../result";

/**
 * Конверт ответа слоя данных.
 *
 * Проверять тут стоит ровно одно: что ветка «не вышло» действительно
 * появляется. Сегодня ей неоткуда сработать — стор не падает, — и именно
 * поэтому её легко сломать незаметно: пока `attempt` возвращает успех на любом
 * входе, все экраны выглядят рабочими, а первый же настоящий `fetch` покажет
 * белый экран вместо сообщения.
 */

describe("attempt", () => {
  it("возвращает успех с результатом синхронной операции", async () => {
    // Arrange
    const run = () => 42;

    // Act
    const res = await attempt(run);

    // Assert
    expect(res).toEqual({ ok: true, data: 42 });
  });

  it("дожидается промиса и отдаёт его значение", async () => {
    // Arrange
    const run = () => Promise.resolve(["a"]);

    // Act
    const res = await attempt(run);

    // Assert
    expect(res).toEqual({ ok: true, data: ["a"] });
  });

  it("превращает исключение в отказ с ключом по умолчанию", async () => {
    // Arrange
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Act
    const res = await attempt(() => {
      throw new Error("хранилище недоступно");
    });

    // Assert
    expect(res).toEqual({ ok: false, error: "data.failed" });
    spy.mockRestore();
  });

  it("ловит и отказ промиса, а не только синхронный бросок", async () => {
    // Arrange
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Act
    const res = await attempt(() => Promise.reject(new Error("обрыв связи")));

    // Assert
    expect(res.ok).toBe(false);
    spy.mockRestore();
  });

  it("отдаёт переданный ключ сообщения вместо общего", async () => {
    // Arrange
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Act
    const res = await attempt(() => {
      throw new Error("нет");
    }, "import.msg.templateFailed");

    // Assert
    expect(res).toEqual({ ok: false, error: "import.msg.templateFailed" });
    spy.mockRestore();
  });

  it("пишет подробности в консоль, а не в ответ", async () => {
    // Arrange
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Act
    await attempt(() => {
      throw new Error("SQLSTATE 23505");
    });

    // Assert: сырой текст ошибки не место на экране — интерфейс двуязычный,
    // перевести серверную фразу нечем.
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("ok / fail", () => {
  it("различаются по флагу, а не по наличию поля", () => {
    // Arrange / Act
    const good = ok(1);
    const bad = fail("data.failed");

    // Assert
    expect(good.ok).toBe(true);
    expect(bad.ok).toBe(false);
  });
});
