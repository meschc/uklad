// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { COMPARE_LIMIT } from "../../../lib/compare";
import { setLang } from "../../../lib/lang";
import { MarketScreen } from "../MarketScreen";
import { fillRequest } from "./fillRequest";
import { stubLeads, type LeadsStub } from "./leadsTransport";

/**
 * Сравнение складов на витрине.
 *
 * Расчёт строк проверяется отдельно и по-честному (`lib/__tests__/compare`),
 * поэтому здесь — только то, что живёт между карточкой, полосой и таблицей и
 * ломается молча: предел в четыре склада, набор, переживающий смену фильтра, и
 * таблица, которая не остаётся с одной колонкой.
 *
 * Язык ставится явно: без адреса и без сохранённого выбора витрина берёт его из
 * `navigator.languages`, а в тестовом браузере там английский.
 */

/** Отметить склад: кнопка карточки, пока склад не отмечен. */
function markButtons(): HTMLButtonElement[] {
  return screen.getAllByRole("button", { name: /^Сравнить: / });
}

/** Кнопка полосы — открыть таблицу. Точное имя, без двоеточия и склада. */
function openButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: "Сравнить" });
}

describe("MarketScreen — сравнение складов", () => {
  let leads: LeadsStub;

  beforeEach(() => {
    setLang("ru");
    leads = stubLeads();
  });

  afterEach(() => {
    leads.restore();
  });

  test("одного отмеченного склада для сравнения мало", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<MarketScreen />);

    // Act
    await user.click(markButtons()[0]);

    // Assert — полоса появилась, но сравнивать пока не с чем
    expect(screen.getByRole("button", { name: "Очистить" })).toBeInTheDocument();
    expect(openButton()).toBeDisabled();
  });

  test("на пределе отметить ещё один склад нельзя", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<MarketScreen />);

    // Act
    for (let i = 0; i < COMPARE_LIMIT; i++) await user.click(markButtons()[0]);

    // Assert — оставшиеся переключатели гаснут, а не молча ничего не делают
    const rest = markButtons();
    expect(rest.length).toBeGreaterThan(0);
    for (const button of rest) expect(button).toBeDisabled();
  });

  test("отметка переживает смену фильтра, даже когда выдача пуста", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<MarketScreen />);
    await user.click(markButtons()[0]);
    const marked = screen
      .getAllByRole("button", { name: /^Убрать из сравнения: / })[0]
      .getAttribute("aria-label") as string;

    // Act — запрос, под который не подходит ни один склад
    // Поле поиска ищется по началу подсказки: пробелов в образце нет намеренно,
    // типографика витрины склеивает короткие слова неразрывным пробелом.
    await user.type(screen.getByPlaceholderText(/^Название/), "зззз");

    // Assert — каталог пуст, но выбор человека на месте
    expect(screen.getByText("Под такие условия склада нет")).toBeInTheDocument();
    const chips = screen.getAllByRole("button", { name: /^Убрать из сравнения: / });
    expect(chips).toHaveLength(1);
    expect(chips[0]).toHaveAttribute("aria-label", marked);
  });

  test("таблица открывается колонкой на каждый отмеченный склад", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<MarketScreen />);

    // Act
    await user.click(markButtons()[0]);
    await user.click(markButtons()[0]);
    await user.click(openButton());

    // Assert — угол таблицы плюс две колонки складов
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getAllByRole("columnheader")).toHaveLength(3);
    expect(within(dialog).getByRole("rowheader", { name: /Хранение/ })).toBeInTheDocument();
  });

  test("лучшее в строке помечено словом, а не одним цветом", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<MarketScreen />);

    // Act
    await user.click(markButtons()[0]);
    await user.click(markButtons()[0]);
    await user.click(openButton());

    // Assert — победители читаются и голосом, а не только глазами
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getAllByText(/лучшее в строке/).length).toBeGreaterThan(0);
  });

  test("вычеркнув склад из таблицы до одного, слой закрывается сам", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<MarketScreen />);
    await user.click(markButtons()[0]);
    await user.click(markButtons()[0]);
    await user.click(openButton());

    // Act — убираем склад прямо из шапки колонки
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getAllByRole("button", { name: /^Убрать из сравнения: / })[0]);

    // Assert — таблицы из одной колонки не бывает, а полоса остаётся
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(openButton()).toBeDisabled();
  });

  test("заявка сразу по нескольким складам ждёт полей и согласия", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<MarketScreen />);
    await user.click(markButtons()[0]);
    await user.click(markButtons()[0]);
    await user.click(openButton());
    const dialog = screen.getByRole("dialog");
    const send = () =>
      within(dialog).getByRole("button", { name: /Отправить заявку|Отправляем|Отправлено/ });

    // Assert — пустая заявка не уходит ни в один склад, и на кнопке видно, во
    // сколько складов она пойдёт
    expect(send()).toBeDisabled();
    expect(send()).toHaveTextContent(/в\s2 склада/);

    // Act
    fillRequest();
    await user.click(within(dialog).getAllByRole("checkbox")[0]);
    await user.click(send());

    // Assert — в теме письма перечислены оба склада: заявка ушла не одному
    await waitFor(() => expect(send()).toHaveTextContent("Отправлено"));
    expect(send()).toBeDisabled();
    expect(leads.sent()?.subject).toMatch(/Заявка в\s2 склада: .+, .+/);
  });

  test("объём из расчёта над списком приезжает в заявку сам", async () => {
    // Arrange — человек вписал объём в панель расчёта
    const user = userEvent.setup();
    render(<MarketScreen />);
    fireEvent.change(screen.getByLabelText(/Сборка/), { target: { value: "900" } });
    await user.click(markButtons()[0]);
    await user.click(markButtons()[0]);

    // Act
    await user.click(openButton());

    // Assert — в заявке то же число: спросить его второй раз значит
    // напроситься на расхождение расчёта и заявки
    expect(document.getElementById("request-orders")).toHaveValue("900");
  });
});
