// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WAREHOUSES } from "../../../data/warehouses";
import { setLang } from "../../../lib/lang";
import { WarehouseScreen } from "../WarehouseScreen";
import { fillRequest, pastDate } from "./fillRequest";
import { stubLeads, type LeadsStub } from "./leadsTransport";

/**
 * Заявка складу — конец пути селлера по витрине и единственное место, где он
 * оставляет о себе данные. Здесь проверяется не оформление карточки, а условия
 * отправки: заявка должна быть заполнена, дата — не вчерашней, согласие на
 * обработку данных — данным, а согласие на рекламу к отправке отношения не
 * имеет. И рядом с заблокированной кнопкой должно быть написано, чего не
 * хватает: кнопка, которая просто не нажимается, — тупик.
 *
 * Приёмник заявок в этих тестах настроен (`leadsTransport`): так видно не
 * только подпись кнопки, но и письмо, которое уехало складу.
 *
 * Язык ставится явно: без адреса и без сохранённого выбора витрина определяет
 * его по `navigator.languages`, а в тестовом браузере там английский — тексты
 * приезжали бы не те, что видит человек на `uklad.ru`.
 */
const WAREHOUSE = WAREHOUSES[0];

function sendButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: /Отправить заявку|Отправляем|Отправлено/ });
}

/** Галочки согласий в порядке разметки: обработка данных, затем реклама. */
function consentBoxes(): HTMLInputElement[] {
  return screen.getAllByRole("checkbox");
}

describe("WarehouseScreen — заявка складу", () => {
  let leads: LeadsStub;

  beforeEach(() => {
    setLang("ru");
    leads = stubLeads();
  });

  afterEach(() => {
    leads.restore();
  });

  test("пустая заявка не уходит, и подсказка называет первое незаполненное поле", () => {
    // Arrange · Act
    render(<WarehouseScreen id={WAREHOUSE.id} />);

    // Assert
    expect(sendButton()).toBeDisabled();
    expect(screen.getByText("Напишите, какой товар везёте.")).toBeInTheDocument();
  });

  test("подсказка называет именно то поле, которое пропустили", () => {
    // Arrange
    render(<WarehouseScreen id={WAREHOUSE.id} />);

    // Act — заполнено всё, кроме города
    fillRequest({ city: "" });

    // Assert
    expect(screen.getByText("Укажите город, откуда поедет товар.")).toBeInTheDocument();
    expect(sendButton()).toBeDisabled();
  });

  test("дата поставки в прошлом заявку не пускает", () => {
    // Arrange
    render(<WarehouseScreen id={WAREHOUSE.id} />);

    // Act
    fillRequest({ date: pastDate() });

    // Assert
    expect(screen.getByText("Дата поставки уже прошла.")).toBeInTheDocument();
    expect(sendButton()).toBeDisabled();
  });

  test("заполненная заявка ждёт согласия на обработку данных", () => {
    // Arrange
    render(<WarehouseScreen id={WAREHOUSE.id} />);

    // Act
    fillRequest();

    // Assert — про поля больше не напоминают, речь уже о согласии
    expect(screen.getByText("Отметьте согласие на обработку данных.")).toBeInTheDocument();
    expect(sendButton()).toBeDisabled();
  });

  test("одного согласия без заполненных полей мало", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<WarehouseScreen id={WAREHOUSE.id} />);

    // Act
    await user.click(consentBoxes()[0]);

    // Assert — согласие есть, заявки нет
    expect(sendButton()).toBeDisabled();
  });

  test("согласия на рекламу для отправки недостаточно", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<WarehouseScreen id={WAREHOUSE.id} />);
    fillRequest();

    // Act — отмечаем только рекламу
    await user.click(consentBoxes()[1]);

    // Assert — обязательное согласие всё ещё не дано
    expect(sendButton()).toBeDisabled();
  });

  test("заполненная заявка с согласием уходит", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<WarehouseScreen id={WAREHOUSE.id} />);
    fillRequest();

    // Act
    await user.click(consentBoxes()[0]);
    expect(sendButton()).toBeEnabled();
    await user.click(sendButton());

    // Assert — кнопка подтверждает отправку и больше не нажимается повторно
    await waitFor(() => expect(sendButton()).toHaveTextContent("Отправлено"));
    expect(sendButton()).toBeDisabled();
  });

  test("в письме склада стоит его название и то, что вписали в поля", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<WarehouseScreen id={WAREHOUSE.id} />);
    fillRequest();

    // Act
    await user.click(consentBoxes()[0]);
    await user.click(sendButton());

    // Assert — по теме письма заявку находят в почте через полгода, а поля
    // должны доехать теми же словами, какими их спрашивали
    await waitFor(() => expect(leads.sent()).not.toBeNull());
    const lead = leads.sent();
    expect(lead?.subject).toContain(WAREHOUSE.name.ru);
    expect(lead?.fields["Тип товара"]).toBe("Одежда и обувь");
    expect(lead?.fields["Объём"]).toContain("120");
    expect(lead?.consent).toEqual({ data: true, ads: false });
  });

  test("после отправки полей и галочек на странице не остаётся", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<WarehouseScreen id={WAREHOUSE.id} />);
    fillRequest();

    // Act
    await user.click(consentBoxes()[0]);
    await user.click(sendButton());

    // Assert — заявка уже у склада, править её здесь нечем
    await waitFor(() => expect(screen.queryAllByRole("checkbox")).toHaveLength(0));
    expect(document.getElementById("request-goods")).toBeNull();
  });

  test("неизвестный склад показывает «страница не найдена», а не пустоту", () => {
    // Arrange · Act
    render(<WarehouseScreen id="w-не-существует" />);

    // Assert
    expect(screen.queryByRole("button", { name: /Отправить заявку/ })).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });
});
