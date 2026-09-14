// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEditor } from "@/lib/store";
import { EMPTY_RECEIVING } from "@/lib/receiving";
import { ReceivingScreen } from "../ReceivingScreen";

/**
 * Приёмка — мастер, а не форма: шаги идут в том порядке, в каком человек
 * физически работает на рампе. Здесь проверяется именно порядок и выходы из
 * него, потому что ломается обычно он, а не отдельный шаг:
 *
 *  · начинают всегда с поставки — без неё непонятно, что сверять;
 *  · паллета необязательна, её можно пропустить и открыть тару сразу;
 *  · из любого места мастера можно вернуться и сменить поставку;
 *  · у кроссдок-поставки шага «место» нет вовсе (п.10.1) — товар на полку не
 *    встаёт, и лишний шаг в полосе прогресса обещал бы работу, которой нет.
 *
 * Стор поднимается настоящий, а не заглушка: поставки, тара и паллеты живут в
 * нём, и подменять его значило бы проверять свою же выдумку вместо экрана.
 * Поставки создаются здесь же, а не берутся из демо-данных, — тест не должен
 * падать от того, что в сид добавили ещё одну строку.
 */
function addShipment(opts?: { crossDock?: boolean }): string {
  const state = useEditor.getState();
  const productId = state.products[0].id;
  return state.createExpectedShipment(
    "manual",
    [{ productId, expectedQty: 10 }],
    opts?.crossDock ? "Кроссдок" : "Поставка",
    opts,
  );
}

/** Подписи шагов в полосе прогресса — в порядке разметки. */
function stepLabels(): string[] {
  const list = screen.getByRole("list");
  return within(list)
    .getAllByRole("listitem")
    .map((li) => li.textContent?.trim() ?? "");
}

describe("ReceivingScreen — порядок шагов", () => {
  beforeEach(() => {
    // Каждый тест начинается с пустого списка поставок и мастера с нуля: ход
    // приёмки живёт в сторе (п.4.7), и остатки прошлого теста открывали бы
    // экран посреди чужой работы.
    useEditor.setState({
      expectedShipments: [],
      boxes: [],
      pallets: [],
      receiving: EMPTY_RECEIVING,
    });
  });

  test("мастер открывается на выборе поставки, полосы прогресса ещё нет", () => {
    // Arrange · Act
    render(<ReceivingScreen />);

    // Assert
    expect(screen.getByRole("button", { name: /Принять без сверки/ })).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });

  test("выбранная поставка ведёт на шаг паллеты", async () => {
    // Arrange
    const user = userEvent.setup();
    addShipment();
    render(<ReceivingScreen />);

    // Act
    await user.click(screen.getByRole("button", { name: /Поставка/ }));

    // Assert
    expect(screen.getByText("Отсканируйте паллету")).toBeInTheDocument();
    expect(stepLabels()[0]).toContain("Паллета");
  });

  test("паллету можно пропустить — мелкая поставка идёт сразу в тару", async () => {
    // Arrange
    const user = userEvent.setup();
    addShipment();
    render(<ReceivingScreen />);

    // Act
    await user.click(screen.getByRole("button", { name: /Поставка/ }));
    await user.click(screen.getByRole("button", { name: /Без паллеты/ }));

    // Assert
    expect(screen.getByText("Отсканируйте тару")).toBeInTheDocument();
  });

  test("«Новая тара» заводит тару через слой данных и открывает шаг товара", async () => {
    // Arrange: команды приёмки уехали в `fulfillmentRepository` и стали
    // асинхронными (п.3.2.1) — экран обязан дождаться ответа и только потом
    // переводить кладовщика на следующий шаг.
    const user = userEvent.setup();
    addShipment();
    render(<ReceivingScreen />);
    await user.click(screen.getByRole("button", { name: /Поставка/ }));
    await user.click(screen.getByRole("button", { name: /Без паллеты/ }));

    // Act
    await user.click(screen.getByRole("button", { name: /Новая тара/ }));

    // Assert
    expect(await screen.findByText("Отсканируйте товар")).toBeInTheDocument();
    expect(useEditor.getState().boxes).toHaveLength(1);
  });

  test("успех скана виден в строке состояния, а не гаснет на переходе", async () => {
    // Arrange: у экрана одна строка состояния на всё — и на «не тот штрихкод»,
    // и на удачу. Успех пишется перед сменой шага, а смена шага гасит строку:
    // если порядок перепутать, React склеит обновления и человек увидит экран,
    // который отзывается только руганью.
    const user = userEvent.setup();
    addShipment();
    render(<ReceivingScreen />);
    await user.click(screen.getByRole("button", { name: /Поставка/ }));
    await user.click(screen.getByRole("button", { name: /Без паллеты/ }));

    // Act
    await user.click(screen.getByRole("button", { name: /Новая тара/ }));

    // Assert
    const code = useEditor.getState().boxes[0].barcode;
    expect(await screen.findByRole("status")).toHaveTextContent(code);
  });

  test("«Сменить поставку» возвращает в начало мастера", async () => {
    // Arrange
    const user = userEvent.setup();
    addShipment();
    render(<ReceivingScreen />);
    await user.click(screen.getByRole("button", { name: /Поставка/ }));

    // Act
    await user.click(screen.getByRole("button", { name: /Сменить поставку/ }));

    // Assert
    expect(screen.getByRole("button", { name: /Принять без сверки/ })).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });

  test("у кроссдок-поставки шага «место» нет", async () => {
    // Arrange
    const user = userEvent.setup();
    addShipment({ crossDock: true });
    render(<ReceivingScreen />);

    // Act
    await user.click(screen.getByRole("button", { name: /Кроссдок/ }));

    // Assert
    const labels = stepLabels();
    expect(labels).toHaveLength(4);
    expect(labels.join(" ")).not.toContain("Место");
  });

  test("уход на другой экран не сбрасывает мастер к выбору поставки", async () => {
    // Arrange: приёмка идёт часами и прерывается постоянно — посмотреть
    // задание, ответить в переписке. Уход туда размонтирует экран (п.4.7).
    const user = userEvent.setup();
    addShipment();
    const { unmount } = render(<ReceivingScreen />);
    await user.click(screen.getByRole("button", { name: /Поставка/ }));
    await user.click(screen.getByRole("button", { name: /Без паллеты/ }));
    await user.click(screen.getByRole("button", { name: /Новая тара/ }));
    await screen.findByText("Отсканируйте товар");
    const code = useEditor.getState().boxes[0].barcode;

    // Act
    unmount();
    render(<ReceivingScreen />);

    // Assert — тот же шаг и та же открытая тара, а не начало мастера
    expect(await screen.findByText("Отсканируйте товар")).toBeInTheDocument();
    expect(screen.getByText(new RegExp(code))).toBeInTheDocument();
  });

  test("вернувшийся мастер не открывается на таре, которую уже увезли", async () => {
    // Arrange: тару закрыли и поставили на место с другого устройства — в
    // открытую она уже не превратится, и лить в неё товар нельзя.
    const user = userEvent.setup();
    addShipment();
    const { unmount } = render(<ReceivingScreen />);
    await user.click(screen.getByRole("button", { name: /Поставка/ }));
    await user.click(screen.getByRole("button", { name: /Без паллеты/ }));
    await user.click(screen.getByRole("button", { name: /Новая тара/ }));
    await screen.findByText("Отсканируйте товар");
    const box = useEditor.getState().boxes[0];
    useEditor.getState().placeBox(box.id, {
      floorId: useEditor.getState().warehouse.floors[0].id,
      moduleId: "m1",
      shelfIndex: 0,
      cellIndex: 0,
    });

    // Act
    unmount();
    render(<ReceivingScreen />);

    // Assert — назад на шаг тары, а не на скан товара в никуда
    expect(await screen.findByText("Отсканируйте тару")).toBeInTheDocument();
  });

  test("обычная поставка проходит все пять шагов, включая место", async () => {
    // Arrange
    const user = userEvent.setup();
    addShipment();
    render(<ReceivingScreen />);

    // Act
    await user.click(screen.getByRole("button", { name: /Поставка/ }));

    // Assert
    const labels = stepLabels();
    expect(labels).toHaveLength(5);
    expect(labels.join(" ")).toContain("Место");
  });
});
