import { describe, expect, it, vi } from "vitest";
import { makeRequest } from "../../__tests__/fixtures";
import type { EditorState } from "../../store/state";
import type { StorePort } from "../repository";
import { createRequestsRepository } from "../requestsRepository";

/**
 * Репозиторий заявок через подменённый порт.
 *
 * Ради этого порт и заведён: если репозиторий проверяется только вместе с
 * настоящим Zustand, значит он с ним и сросся — а весь смысл шва в том, чтобы
 * реализацию можно было заменить сетью, не трогая вызывающий код. Тест здесь
 * заодно и доказательство, что замена возможна.
 */

/** Порт из голого объекта: ни стора, ни localStorage тест не касается. */
function fakePort(state: Partial<EditorState>): StorePort {
  return {
    get: () => state as EditorState,
    set: () => {},
  };
}

describe("createRequestsRepository", () => {
  it("отдаёт список заявок из порта", async () => {
    // Arrange
    const req = makeRequest();
    const repo = createRequestsRepository(fakePort({ requests: [req] }));

    // Act
    const res = await repo.list();

    // Assert
    expect(res).toEqual({ ok: true, data: [req] });
  });

  it("выбрасывает записи неверной формы, но остальные отдаёт", async () => {
    // Arrange: одна битая строка в хранилище не повод показать пустой экран
    // вместо остальных заявок.
    const good = makeRequest();
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const repo = createRequestsRepository(
      fakePort({ requests: [good, { id: "" } as never, null as never] }),
    );

    // Act
    const res = await repo.list();

    // Assert
    expect(res).toEqual({ ok: true, data: [good] });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("на отсутствующем id отвечает успехом с null, а не отказом", async () => {
    // Arrange: «такой заявки нет» — это ответ, а не сбой.
    const repo = createRequestsRepository(fakePort({ requests: [] }));

    // Act
    const res = await repo.get("нет-такого");

    // Assert
    expect(res).toEqual({ ok: true, data: null });
  });

  it("находит заявку по id", async () => {
    // Arrange
    const a = makeRequest();
    const b = makeRequest();
    const repo = createRequestsRepository(fakePort({ requests: [a, b] }));

    // Act
    const res = await repo.get(b.id);

    // Assert
    expect(res).toEqual({ ok: true, data: b });
  });

  it("передаёт создание в стор и возвращает выданные id", async () => {
    // Arrange
    const createRequests = vi.fn(() => ["req-new"]);
    const repo = createRequestsRepository(fakePort({ createRequests }));
    const items = [{ productId: "prod-1", qty: 3 }];

    // Act
    const res = await repo.create(items, 1700000000000);

    // Assert
    expect(createRequests).toHaveBeenCalledWith(items, 1700000000000);
    expect(res).toEqual({ ok: true, data: ["req-new"] });
  });

  it("превращает падение действия в отказ, а не в исключение наружу", async () => {
    // Arrange: экрану нужна ветка «не вышло», а не необработанный промис.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const repo = createRequestsRepository(
      fakePort({
        updateRequestStatus: () => {
          throw new Error("сервер недоступен");
        },
      }),
    );

    // Act
    const res = await repo.setStatus("req-1", "cancelled");

    // Assert
    expect(res).toEqual({ ok: false, error: "data.failed" });
    spy.mockRestore();
  });

  it("бронь без подходящей поставки — успех со значением null", async () => {
    // Arrange: бронировать не под что — обычный исход, заявка просто ждёт.
    const repo = createRequestsRepository(fakePort({ reserveRequest: () => null }));

    // Act
    const res = await repo.reserve("req-1");

    // Assert
    expect(res).toEqual({ ok: true, data: null });
  });
});
