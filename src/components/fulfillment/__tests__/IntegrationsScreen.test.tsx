// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Сборка с сервером: подключаются только площадки с серверным прокси.
vi.mock("@/lib/data/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/data/api")>()),
  hasCabinetServer: true,
}));
vi.mock("@/lib/data/connectorsRepository", async (orig) => ({
  ...(await orig<typeof import("@/lib/data/connectorsRepository")>()),
  connectorsRepository: { list: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
}));

const { IntegrationsScreen } = await import("../IntegrationsScreen");

const card = (title: string) =>
  screen.getByText(title, { selector: "p *, p" }).closest("section") as HTMLElement;

/**
 * Все системы видны (Кирилл 19.11): без серверной части — «В следующих
 * обновлениях» и без «Настроить»; у Ozon, WB и Маркета — «Инструкция».
 */
describe("IntegrationsScreen с сервером", () => {
  test("Авито и Lamoda видны, но не настраиваются", () => {
    render(<IntegrationsScreen />);
    for (const title of ["Авито", "Lamoda", "МойСклад", "Честный знак"]) {
      const c = card(title);
      expect(within(c).getByText("В следующих обновлениях")).toBeTruthy();
      expect(within(c).queryByRole("button", { name: "Настроить" })).toBeNull();
    }
    expect(screen.getByText("Подключено 0 из 3, ещё 17 — в следующих обновлениях")).toBeTruthy();
  });

  test("у Ozon «Инструкция» раскрывает шаги перед документацией", async () => {
    render(<IntegrationsScreen />);
    const c = card("Ozon Seller API");
    await userEvent.click(within(c).getByRole("button", { name: "Настроить" }));
    const howTo = within(c).getByRole("button", { name: "Инструкция" });
    expect(howTo.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(howTo);
    expect(within(c).getAllByRole("listitem")).toHaveLength(5);
    expect(within(c).getByText(/Seller API/, { selector: "li" })).toBeTruthy();
  });
});
